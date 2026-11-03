import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireMembership, requireRole, scopedCampusId } from "@/lib/authorization";
import { toMilliUnits } from "@/lib/domain";
import { assertSameOrigin, HttpError, jsonError, readJson, requiredText } from "@/lib/http";
import { prisma } from "@/lib/db";

function parseQuoteItems(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new HttpError(400, "A quotation must include at least one requested ingredient.");
  }
  const items = value.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new HttpError(400, "Each quote item needs an ingredient, quantity, and price.");
    }
    const row = value as Record<string, unknown>;
    const quantity = String(row.quantity ?? "");
    const parsedQuantity = toMilliUnits(quantity);
    if (parsedQuantity === null || parsedQuantity <= 0n) {
      throw new HttpError(400, "Quoted quantities must be positive with up to 3 decimal places.");
    }
    const unitCost = String(row.unitCost ?? "");
    if (!/^(0|[1-9]\d{0,7})(?:\.\d{1,4})?$/.test(unitCost)) {
      throw new HttpError(400, "Quoted unit costs must be non-negative with up to 4 decimal places.");
    }
    return { ingredientId: requiredText(row.ingredientId, "Ingredient"), quantity, unitCost };
  });
  if (new Set(items.map((item) => item.ingredientId)).size !== items.length) {
    throw new HttpError(400, "Each ingredient may appear only once in a quotation.");
  }
  return items;
}

export async function GET(request: Request) {
  try {
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "KITCHEN_STAFF", "PROCUREMENT_OFFICER"]);
    const campusId = scopedCampusId(session, new URL(request.url).searchParams.get("campusId"));
    const quotes = await prisma.supplierQuote.findMany({
      where: {
        institutionId: session.membership.institutionId,
        ...(campusId ? { purchaseRequest: { campusId } } : {}),
      },
      select: {
        id: true,
        status: true,
        validUntil: true,
        note: true,
        createdAt: true,
        supplier: { select: { id: true, name: true } },
        purchaseRequest: { select: { id: true, status: true, campus: { select: { name: true } } } },
        items: {
          select: {
            id: true,
            quantity: true,
            unitCost: true,
            ingredient: { select: { id: true, name: true, unit: true } },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
    });
    return NextResponse.json({ quotes });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "PROCUREMENT_OFFICER"]);
    const body = await readJson(request);
    const purchaseRequestId = requiredText(body.purchaseRequestId, "Purchase request");
    const supplierId = requiredText(body.supplierId, "Supplier");
    const items = parseQuoteItems(body.items);
    const note = body.note === undefined || body.note === "" ? null : requiredText(body.note, "Quote note", 1, 500);
    let validUntil: Date | null = null;
    if (body.validUntil !== undefined && body.validUntil !== "") {
      if (typeof body.validUntil !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.validUntil)) {
        throw new HttpError(400, "Quote validity date must be a valid calendar date.");
      }
      validUntil = new Date(`${body.validUntil}T00:00:00.000Z`);
      if (Number.isNaN(validUntil.getTime()) || validUntil.toISOString().slice(0, 10) !== body.validUntil) {
        throw new HttpError(400, "Quote validity date must be a valid calendar date.");
      }
    }
    const campusId = scopedCampusId(session);
    const [purchaseRequest, supplier] = await Promise.all([
      prisma.purchaseRequest.findFirst({
        where: { id: purchaseRequestId, institutionId: session.membership.institutionId, ...(campusId ? { campusId } : {}) },
        select: { id: true, status: true, items: { select: { ingredientId: true, quantity: true } } },
      }),
      prisma.supplier.findFirst({
        where: { id: supplierId, institutionId: session.membership.institutionId, active: true },
        select: { id: true },
      }),
    ]);
    if (!purchaseRequest) throw new HttpError(404, "Purchase request not found.");
    if (!supplier) throw new HttpError(404, "Active supplier not found.");
    if (purchaseRequest.status !== "SUBMITTED") throw new HttpError(409, "Quotations can only be recorded for submitted requests.");
    if (purchaseRequest.items.length !== items.length) throw new HttpError(400, "A quote must cover every requested ingredient.");
    const requestItems = new Map(purchaseRequest.items.map((item) => [item.ingredientId, item.quantity.toString()]));
    for (const item of items) {
      if (requestItems.get(item.ingredientId) !== item.quantity) {
        throw new HttpError(400, "Quoted ingredient quantities must match the submitted request exactly.");
      }
    }
    const quote = await prisma.$transaction(async (tx) => {
      const created = await tx.supplierQuote.create({
        data: {
          institutionId: session.membership.institutionId,
          purchaseRequestId,
          supplierId,
          validUntil,
          note,
          items: {
            create: items.map(({ ingredientId, quantity, unitCost }) => ({
              quantity,
              unitCost,
              ingredient: {
                connect: {
                  id_institutionId: {
                    id: ingredientId,
                    institutionId: session.membership.institutionId,
                  },
                },
              },
            })),
          },
        },
        select: { id: true, status: true, createdAt: true },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: "supplier_quote.create",
          entityType: "supplier_quote",
          entityId: created.id,
        },
      });
      return created;
    });
    return NextResponse.json({ quote }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "PROCUREMENT_OFFICER"]);
    const body = await readJson(request);
    const quoteId = requiredText(body.id, "Quotation");
    if (body.action !== "award" && body.action !== "reject") throw new HttpError(400, "Choose award or reject.");
    const campusId = scopedCampusId(session);
    const result = await prisma.$transaction(async (tx) => {
      const quote = await tx.supplierQuote.findFirst({
        where: {
          id: quoteId,
          institutionId: session.membership.institutionId,
          ...(campusId ? { purchaseRequest: { campusId } } : {}),
        },
        include: { purchaseRequest: { include: { items: true } }, supplier: true, items: true },
      });
      if (!quote) throw new HttpError(404, "Quotation not found.");
      const requestLocks = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT status FROM PurchaseRequest
        WHERE id = ${quote.purchaseRequestId}
          AND institutionId = ${session.membership.institutionId}
        FOR UPDATE
      `;
      if (quote.status !== "SUBMITTED" || requestLocks[0]?.status !== "SUBMITTED") {
        throw new HttpError(409, "Only submitted quotations for submitted requests can be awarded or rejected.");
      }
      if (body.action === "reject") {
        await tx.supplierQuote.update({
          where: { id_institutionId: { id: quoteId, institutionId: session.membership.institutionId } },
          data: { status: "REJECTED" },
        });
        await tx.auditEvent.create({
          data: {
            institutionId: session.membership.institutionId,
            actorId: session.userId,
            action: "supplier_quote.reject",
            entityType: "supplier_quote",
            entityId: quoteId,
          },
        });
        return { quoteId, orderId: null };
      }
      if (quote.validUntil && quote.validUntil < new Date(new Date().toISOString().slice(0, 10))) {
        throw new HttpError(409, "This quotation has expired.");
      }
      if (quote.items.length !== quote.purchaseRequest.items.length) {
        throw new HttpError(409, "The quotation no longer covers the full request.");
      }
      const order = await tx.purchaseOrder.create({
        data: {
          institutionId: session.membership.institutionId,
          purchaseRequestId: quote.purchaseRequestId,
          supplierQuoteId: quote.id,
          campusId: quote.purchaseRequest.campusId,
          storeId: quote.purchaseRequest.storeId,
          supplierId: quote.supplierId,
          items: {
            create: quote.items.map((item) => ({
              orderedQuantity: item.quantity,
              unitCost: item.unitCost,
              ingredient: {
                connect: {
                  id_institutionId: {
                    id: item.ingredientId,
                    institutionId: session.membership.institutionId,
                  },
                },
              },
            })),
          },
        },
        select: { id: true },
      });
      await tx.purchaseRequest.update({
        where: { id_institutionId: { id: quote.purchaseRequestId, institutionId: session.membership.institutionId } },
        data: { status: "APPROVED" },
      });
      await tx.supplierQuote.updateMany({
        where: { purchaseRequestId: quote.purchaseRequestId, institutionId: session.membership.institutionId, status: "SUBMITTED" },
        data: { status: "REJECTED" },
      });
      await tx.supplierQuote.update({
        where: { id_institutionId: { id: quote.id, institutionId: session.membership.institutionId } },
        data: { status: "AWARDED" },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: "supplier_quote.award",
          entityType: "purchase_order",
          entityId: order.id,
        },
      });
      return { quoteId, orderId: order.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ result });
  } catch (error) {
    return jsonError(error);
  }
}
