import { NextResponse } from "next/server";
import { requireMembership, requireRole } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { assertSameOrigin, jsonError, readJson, requiredText } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const session = await requireMembership(request);
    const campuses = await prisma.campus.findMany({
      where: {
        institutionId: session.membership.institutionId,
        ...(session.membership.role === "INSTITUTION_ADMIN"
          ? {}
          : { id: session.membership.campusId ?? "" }),
      },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
      take: 200,
    });
    return NextResponse.json({ campuses });
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
    const name = requiredText(body.name, "Campus name");
    const code = requiredText(body.code, "Campus code", 1, 64).toUpperCase();
    const campus = await prisma.$transaction(async (tx) => {
      const created = await tx.campus.create({
        data: {
          institutionId: session.membership.institutionId,
          name,
          code,
        },
        select: { id: true, name: true, code: true },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: "campus.create",
          entityType: "campus",
          entityId: created.id,
        },
      });
      return created;
    });
    return NextResponse.json({ campus }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
