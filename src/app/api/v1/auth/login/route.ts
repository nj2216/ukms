import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { applySessionCookie, hashSessionToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/domain";
import { assertSameOrigin, HttpError, jsonError, readJson, requiredText } from "@/lib/http";
import { verifyPassword } from "@/lib/password";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJson(request);
    const institutionSlug = requiredText(body.institutionSlug, "Institution slug", 1, 191).toLowerCase();
    const email = normalizeEmail(requiredText(body.email, "Email", 3, 191));
    const password = body.password;
    if (typeof password !== "string" || password.length > 128) {
      throw new HttpError(401, "Email, password, or institution is incorrect.");
    }

    const membership = await prisma.membership.findFirst({
      where: {
        institution: { slug: institutionSlug },
        user: { email, active: true },
      },
      include: {
        user: true,
        institution: { select: { id: true, name: true, slug: true } },
        campus: { select: { id: true, name: true } },
      },
    });
    if (!membership) {
      await verifyPassword(password);
      throw new HttpError(401, "Email, password, or institution is incorrect.");
    }

    const login = await prisma.$transaction(async (tx) => {
      const users = await tx.$queryRaw<
        Array<{
          id: string;
          passwordHash: string;
          active: boolean;
          failedLoginAttempts: number;
          lockedUntil: Date | null;
          mustChangePassword: boolean;
        }>
      >`
        SELECT id, passwordHash, active, failedLoginAttempts, lockedUntil, mustChangePassword
        FROM User
        WHERE id = ${membership.userId}
        FOR UPDATE
      `;
      const user = users[0];
      const validPassword = await verifyPassword(password, user?.passwordHash);
      const activeMembership = await tx.membership.findFirst({
        where: {
          id: membership.id,
          userId: membership.userId,
          institutionId: membership.institutionId,
        },
        select: { id: true },
      });
      if (
        !user ||
        !activeMembership ||
        !user.active ||
        (user.lockedUntil && user.lockedUntil > new Date()) ||
        !validPassword
      ) {
        if (
          user?.active &&
          activeMembership &&
          (!user.lockedUntil || user.lockedUntil <= new Date())
        ) {
          const nextFailures = user.failedLoginAttempts + 1;
          await tx.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: { increment: 1 },
              ...(nextFailures >= 8
                ? { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) }
                : {}),
            },
          });
        }
        return null;
      }

      const authenticatedUser = await tx.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
        select: { id: true, name: true, email: true, mustChangePassword: true },
      });
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
      await tx.session.create({
        data: {
          tokenHash: hashSessionToken(token),
          userId: user.id,
          membershipId: membership.id,
          expiresAt,
        },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: membership.institutionId,
          actorId: user.id,
          action: "auth.login",
          entityType: "user",
          entityId: user.id,
        },
      });
      return { user: authenticatedUser, token, expiresAt };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!login) {
      throw new HttpError(401, "Email, password, or institution is incorrect.");
    }
    const response = NextResponse.json({
      user: { id: login.user.id, name: login.user.name, email: login.user.email },
      institution: membership.institution,
      campus: membership.campus,
      role: membership.role,
      mustChangePassword: login.user.mustChangePassword,
    });
    return applySessionCookie(response, login.token, login.expiresAt);
  } catch (error) {
    return jsonError(error);
  }
}
