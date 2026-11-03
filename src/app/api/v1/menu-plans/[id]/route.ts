import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireMembership, requireRole, scopedCampusId } from "@/lib/authorization";
import { assertSameOrigin, HttpError, jsonError, readJson } from "@/lib/http";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER"]);
    const body = await readJson(request);
    if (body.action !== "publish") throw new HttpError(400, "Choose a supported menu plan action.");
    const { id } = await context.params;
    const campusId = scopedCampusId(session);
    const menuPlan = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status
        FROM MenuPlan
        WHERE id = ${id}
          AND institutionId = ${session.membership.institutionId}
          ${campusId ? Prisma.sql`AND campusId = ${campusId}` : Prisma.empty}
        FOR UPDATE
      `;
      const current = rows[0];
      if (!current) throw new HttpError(404, "Meal plan not found.");
      if (current.status !== "DRAFT") throw new HttpError(409, "Only draft meal plans can be published.");
      const published = await tx.menuPlan.update({
        where: { id_institutionId: { id, institutionId: session.membership.institutionId } },
        data: { status: "PUBLISHED" },
        select: { id: true, name: true, status: true },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: "menu_plan.publish",
          entityType: "menu_plan",
          entityId: published.id,
        },
      });
      return published;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ menuPlan });
  } catch (error) {
    return jsonError(error);
  }
}
