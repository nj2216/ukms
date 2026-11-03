import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireMembership, requireRole, scopedCampusId } from "@/lib/authorization";
import { movementQuantity, toMilliUnits } from "@/lib/domain";
import { assertSameOrigin, HttpError, jsonError, readJson, requiredText } from "@/lib/http";
import { prisma } from "@/lib/db";

function parseItems(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new HttpError(400, "Add between 1 and 100 ingredients to the purchase request.");
  }
  const items = value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new HttpError(400, "Each request item must include an ingredient and quantity.");
    }
    const row = item as Record<string, unknown>;
    const ingredientId = requiredText(row.ingredientId, "Ingredient");
    const quantity = String(row.quantity ?? "");
    const milliUnits = toMilliUnits(quantity);
    if (milliUnits === null || milliUnits <= 0n) {
      throw new HttpError(400, "Requested quantities must be positive with up to 3 decimal places.");
    }
    let estimatedUnitCost: string | null = null;
    if (row.estimatedUnitCost !== undefined && row.estimatedUnitCost !== "") {
      estimatedUnitCost = String(row.estimatedUnitCost);
      if (!/^(0|[1-9]\d{0,7})(?:\.\d{1,4})?$/.test(estimatedUnitCost)) {
        throw new HttpError(400, "Estimated unit costs must be non-negative with up to 4 decimal places.");
      }
    }
    return { ingredientId, quantity, estimatedUnitCost };
  });
  if (new Set(items.map((item) => item.ingredientId)).size !== items.length) {
    throw new HttpError(400, "Each ingredient can appear only once in a purchase request.");
  }
  return items;
}

export async function GET(request: Request) {
  try {
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "KITCHEN_STAFF", "STOREKEEPER"]);
    const url = new URL(request.url);
    const campusId = scopedCampusId(session, url.searchParams.get("campusId"));
    const status = url.searchParams.get("status");
    const allowedStatuses = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"] as const;
    if (status && !allowedStatuses.includes(status as (typeof allowedStatuses)[number])) {
      throw new HttpError(400, "Invalid purchase request status.");
    }
    const requests = await prisma.purchaseRequest.findMany({
      where: {
        institutionId: session.membership.institutionId,
        ...(campusId ? { campusId } : {}),
        ...(status ? { status: status as (typeof allowedStatuses)[number] } : {}),
      },
      select: {
        id: true,
        status: true,
        note: true,
        createdAt: true,
        campus: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        items: {
          select: {
            id: true,
            quantity: true,
            estimatedUnitCost: true,
            ingredient: { select: { id: true, name: true, unit: true } },
          },
        },
        purchaseOrder: {
          select: { id: true, status: true },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    return NextResponse.json({ requests });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "KITCHEN_STAFF"]);
    const body = await readJson(request);
    const storeId = requiredText(body.storeId, "Receiving store");
    const supplierId = requiredText(body.supplierId, "Supplier");
    const requestedCampus = typeof body.campusId === "string" ? body.campusId : session.membership.campusId;
    const campusId = scopedCampusId(session, requestedCampus);
    if (!campusId) throw new HttpError(400, "A campus is required.");
    const note = body.note === undefined || body.note === "" ? null : requiredText(body.note, "Note", 1, 500);
    const items = parseItems(body.items);
    const [store, supplier, ingredients] = await Promise.all([
      prisma.store.findFirst({
        where: { id: storeId, campusId, institutionId: session.membership.institutionId },
        select: { id: true },
      }),
      prisma.supplier.findFirst({
        where: { id: supplierId, institutionId: session.membership.institutionId, active: true },
        select: { id: true },
      }),
      prisma.ingredient.findMany({
        where: {
          institutionId: session.membership.institutionId,
          active: true,
          id: { in: items.map((item) => item.ingredientId) },
        },
        select: { id: true },
      }),
    ]);
    if (!store) throw new HttpError(404, "Receiving store not found in the selected campus.");
    if (!supplier) throw new HttpError(404, "Supplier not found.");
    if (ingredients.length !== items.length) throw new HttpError(400, "One or more ingredients are unavailable.");

    const purchaseRequest = await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseRequest.create({
        data: {
          institutionId: session.membership.institutionId,
          campusId,
          storeId: store.id,
          supplierId: supplier.id,
          note,
          items: {
            create: items.map((item) => ({
              ingredientId: item.ingredientId,
              quantity: item.quantity,
              estimatedUnitCost: item.estimatedUnitCost,
            })),
          },
        },
        select: { id: true },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: "purchase_request.create",
          entityType: "purchase_request",
          entityId: created.id,
        },
      });
      return created;
    });
    return NextResponse.json({ purchaseRequest }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireMembership(request);
    const body = await readJson(request);
    const id = requiredText(body.id, "Purchase request");
    const action = body.action;
    if (!["submit", "approve", "reject"].includes(String(action))) {
      throw new HttpError(400, "Choose submit, approve, or reject.");
    }
    requireRole(
      session,
      action === "submit"
        ? ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "KITCHEN_STAFF"]
        : ["INSTITUTION_ADMIN", "CAMPUS_MANAGER"],
    );
    const campusId = scopedCampusId(session);
    const updated = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status
        FROM PurchaseRequest
        WHERE id = ${id}
          AND institutionId = ${session.membership.institutionId}
          ${campusId ? Prisma.sql`AND campusId = ${campusId}` : Prisma.empty}
        FOR UPDATE
      `;
      const current = rows[0];
      if (!current) throw new HttpError(404, "Purchase request not found.");

      if (action === "submit") {
        if (current.status !== "DRAFT") throw new HttpError(409, "Only draft requests can be submitted.");
        await tx.purchaseRequest.update({
          where: { id_institutionId: { id, institutionId: session.membership.institutionId } },
          data: { status: "SUBMITTED" },
        });
      } else {
        if (current.status !== "SUBMITTED") throw new HttpError(409, "Only submitted requests can be approved or rejected.");
        if (action === "approve") {
          const purchaseRequest = await tx.purchaseRequest.findFirstOrThrow({
            where: { id, institutionId: session.membership.institutionId },
            include: { items: true },
          });
          const order = await tx.purchaseOrder.create({
            data: {
              institutionId: session.membership.institutionId,
              purchaseRequestId: id,
              campusId: purchaseRequest.campusId,
              storeId: purchaseRequest.storeId,
              supplierId: purchaseRequest.supplierId,
            },
            select: { id: true },
          });
          await tx.purchaseOrderItem.createMany({
            data: purchaseRequest.items.map((item) => ({
              institutionId: session.membership.institutionId,
              purchaseOrderId: order.id,
              ingredientId: item.ingredientId,
              orderedQuantity: item.quantity,
              unitCost: item.estimatedUnitCost,
            })),
          });
          await tx.purchaseRequest.update({
            where: { id_institutionId: { id, institutionId: session.membership.institutionId } },
            data: { status: "APPROVED" },
          });
          await tx.auditEvent.create({
            data: {
              institutionId: session.membership.institutionId,
              actorId: session.userId,
              action: "purchase_order.create",
              entityType: "purchase_order",
              entityId: order.id,
            },
          });
        } else {
          await tx.purchaseRequest.update({
            where: { id_institutionId: { id, institutionId: session.membership.institutionId } },
            data: { status: "REJECTED" },
          });
        }
      }
      const record = await tx.purchaseRequest.findFirstOrThrow({
        where: { id, institutionId: session.membership.institutionId },
        select: { id: true, status: true, purchaseOrder: { select: { id: true, status: true } } },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: `purchase_request.${action}`,
          entityType: "purchase_request",
          entityId: id,
        },
      });
      return record;
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ purchaseRequest: updated });
  } catch (error) {
    return jsonError(error);
  }
}
