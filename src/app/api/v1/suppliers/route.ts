import { NextResponse } from "next/server";
import { requireMembership, requireRole } from "@/lib/authorization";
import { assertSameOrigin, HttpError, jsonError, readJson, requiredText } from "@/lib/http";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "STOREKEEPER", "KITCHEN_STAFF"]);
    const search = new URL(request.url).searchParams.get("search")?.trim().slice(0, 100);
    const suppliers = await prisma.supplier.findMany({
      where: {
        institutionId: session.membership.institutionId,
        active: true,
        ...(search ? { name: { contains: search } } : {}),
      },
      select: { id: true, name: true, email: true, phone: true, createdAt: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 200,
    });
    return NextResponse.json({ suppliers });
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
    const name = requiredText(body.name, "Supplier name");
    const email = body.email === undefined || body.email === "" ? null : requiredText(body.email, "Email", 3, 191).toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid supplier email address.");
    const phone = body.phone === undefined || body.phone === "" ? null : requiredText(body.phone, "Phone", 1, 64);
    const supplier = await prisma.$transaction(async (tx) => {
      const created = await tx.supplier.create({
        data: { institutionId: session.membership.institutionId, name, email, phone },
        select: { id: true, name: true, email: true, phone: true, createdAt: true },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: "supplier.create",
          entityType: "supplier",
          entityId: created.id,
        },
      });
      return created;
    });
    return NextResponse.json({ supplier }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "A supplier with this name already exists." }, { status: 409 });
    }
    return jsonError(error);
  }
}
