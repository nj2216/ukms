import { NextResponse } from "next/server";
import { requireMembership, requireRole } from "@/lib/authorization";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN"]);
    const events = await prisma.auditEvent.findMany({
      where: { institutionId: session.membership.institutionId },
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
    });
    return NextResponse.json({ events });
  } catch (error) {
    return jsonError(error);
  }
}
