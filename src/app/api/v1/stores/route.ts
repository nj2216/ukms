import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMembership, requireRole, scopedCampusId } from "@/lib/authorization";
import { assertSameOrigin, HttpError, jsonError, readJson, requiredText } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const session = await requireMembership(request);
    const url = new URL(request.url);
    const campusId = scopedCampusId(session, url.searchParams.get("campusId"));
    const stores = await prisma.store.findMany({
      where: {
        institutionId: session.membership.institutionId,
        ...(campusId ? { campusId } : {}),
      },
      select: {
        id: true,
        name: true,
        type: true,
        campus: { select: { id: true, name: true } },
      },
      orderBy: [{ campus: { name: "asc" } }, { name: "asc" }],
      take: 200,
    });
    return NextResponse.json({ stores });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER"]);
    const body = await readJson(request);
    const name = requiredText(body.name, "Store name");
    const campusId =
      typeof body.campusId === "string" ? body.campusId : session.membership.campusId;
    if (!campusId) throw new HttpError(400, "A campus is required.");
    const authorizedCampus = scopedCampusId(session, campusId);
    const campus = await prisma.campus.findFirst({
      where: { id: authorizedCampus, institutionId: session.membership.institutionId },
      select: { id: true },
    });
    if (!campus) throw new HttpError(404, "Campus not found.");
    const type = body.type === "CENTRAL" ? "CENTRAL" : "CAMPUS";
    const store = await prisma.store.create({
      data: {
        name,
        type,
        campusId: campus.id,
        institutionId: session.membership.institutionId,
      },
      select: { id: true, name: true, type: true, campusId: true },
    });
    await prisma.auditEvent.create({
      data: {
        institutionId: session.membership.institutionId,
        actorId: session.userId,
        action: "store.create",
        entityType: "store",
        entityId: store.id,
      },
    });
    return NextResponse.json({ store }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
