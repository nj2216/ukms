import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireMembership, requireRole } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { membershipAccessChangeError, normalizeEmail, type MembershipRole } from "@/lib/domain";
import { assertSameOrigin, HttpError, jsonError, readJson, requiredText } from "@/lib/http";
import { hashPassword } from "@/lib/password";

const roles: MembershipRole[] = [
  "INSTITUTION_ADMIN",
  "CAMPUS_MANAGER",
  "KITCHEN_STAFF",
  "STOREKEEPER",
  "PROCUREMENT_OFFICER",
  "FINANCE_OFFICER",
  "AUDITOR",
];

export async function GET(request: Request) {
  try {
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN"]);
    const memberships = await prisma.membership.findMany({
      where: { institutionId: session.membership.institutionId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            active: true,
            mustChangePassword: true,
          },
        },
        campus: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
      take: 200,
    });
    return NextResponse.json({ memberships });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN"]);
    const body = await readJson(request);
    const name = requiredText(body.name, "Name");
    const email = normalizeEmail(requiredText(body.email, "Email", 3, 191));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError(400, "Enter a valid email address.");
    }
    if (typeof body.role !== "string" || !roles.includes(body.role as (typeof roles)[number])) {
      throw new HttpError(400, "Choose a valid role.");
    }
    const role = body.role as (typeof roles)[number];
    let campusId: string | null = null;
    if (role !== "INSTITUTION_ADMIN") {
      campusId = requiredText(body.campusId, "Campus");
      const campus = await prisma.campus.findFirst({
        where: { id: campusId, institutionId: session.membership.institutionId },
        select: { id: true },
      });
      if (!campus) throw new HttpError(404, "Campus not found.");
    }

    const temporaryPassword = randomBytes(24).toString("base64url");
    const created = await prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { email } });
      let passwordIssued: string | null = null;
      if (!user) {
        user = await tx.user.create({
          data: {
            email,
            name,
            passwordHash: await hashPassword(temporaryPassword),
            mustChangePassword: true,
          },
        });
        passwordIssued = temporaryPassword;
      } else if (!user.active) {
        throw new HttpError(409, "This account is inactive.");
      }

      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          institutionId: session.membership.institutionId,
          campusId,
          role,
        },
        select: { id: true, role: true, campusId: true },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: "membership.create",
          entityType: "membership",
          entityId: membership.id,
        },
      });
      return {
        membership: {
          ...membership,
          user: { id: user.id, name: user.name, email: user.email },
        },
        temporaryPassword: passwordIssued,
      };
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN"]);
    const body = await readJson(request);
    const membershipId = requiredText(body.membershipId, "Membership");
    if (typeof body.role !== "string" || !roles.includes(body.role as MembershipRole)) {
      throw new HttpError(400, "Choose a valid role.");
    }
    const role = body.role as MembershipRole;
    const campusId =
      role === "INSTITUTION_ADMIN" ? null : requiredText(body.campusId, "Campus");

    const membership = await prisma.$transaction(async (tx) => {
      const target = await tx.membership.findFirst({
        where: {
          id: membershipId,
          institutionId: session.membership.institutionId,
        },
        select: { id: true, userId: true, role: true },
      });
      if (!target) throw new HttpError(404, "Membership not found.");

      const adminCount =
        target.role === "INSTITUTION_ADMIN" && role !== "INSTITUTION_ADMIN"
          ? await tx.membership.count({
              where: {
                institutionId: session.membership.institutionId,
                role: "INSTITUTION_ADMIN",
              },
            })
          : 0;
      const accessError = membershipAccessChangeError(
        session.userId,
        target.userId,
        target.role,
        role,
        adminCount,
      );
      if (accessError) throw new HttpError(409, accessError);

      if (campusId) {
        const campus = await tx.campus.findFirst({
          where: {
            id: campusId,
            institutionId: session.membership.institutionId,
          },
          select: { id: true },
        });
        if (!campus) throw new HttpError(404, "Campus not found.");
      }

      const updated = await tx.membership.update({
        where: { id: target.id },
        data: { role, campusId },
        include: {
          user: { select: { id: true, name: true, email: true, active: true, mustChangePassword: true } },
          campus: { select: { id: true, name: true, code: true } },
        },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: "membership.update",
          entityType: "membership",
          entityId: updated.id,
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ membership });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN"]);
    const body = await readJson(request);
    const membershipId = requiredText(body.membershipId, "Membership");
    const target = await prisma.membership.findFirst({
      where: { id: membershipId, institutionId: session.membership.institutionId },
      select: { id: true, role: true, userId: true },
    });
    if (!target) throw new HttpError(404, "Membership not found.");
    if (target.userId === session.userId) {
      throw new HttpError(409, "You cannot revoke your own active membership.");
    }

    await prisma.$transaction(async (tx) => {
      if (target.role === "INSTITUTION_ADMIN") {
        const adminCount = await tx.membership.count({
          where: {
            institutionId: session.membership.institutionId,
            role: "INSTITUTION_ADMIN",
          },
        });
        if (adminCount <= 1) throw new HttpError(409, "The institution must retain an administrator.");
      }
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: "membership.revoke",
          entityType: "membership",
          entityId: target.id,
        },
      });
      await tx.membership.delete({ where: { id: target.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
