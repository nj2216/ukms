import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireMembership, requireRole, scopedCampusId } from "@/lib/authorization";
import { toMilliUnits } from "@/lib/domain";
import { assertSameOrigin, HttpError, jsonError, readJson, requiredText } from "@/lib/http";
import { prisma } from "@/lib/db";

type ReceiptLine = {
  purchaseOrderItemId: string;
  quantity: string;
  batchCode: string | null;
  expiryDate: Date | null;
};

function parseDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, "Expiry date must be a valid calendar date.");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, "Expiry date must be a valid calendar date.");
  }
  return date;
}

function parseLines(value: unknown): ReceiptLine[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new HttpError(400, "Add at least one purchase order item to the receipt.");
  }
  const lines = value.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new HttpError(400, "Each receipt line must identify a purchase order item.");
    }
    const row = value as Record<string, unknown>;
    const quantity = String(row.quantity ?? "");
    const amount = toMilliUnits(quantity);
    if (amount === null || amount <= 0n) {
      throw new HttpError(400, "Receipt quantities must be positive with up to 3 decimal places.");
    }
    return {
      purchaseOrderItemId: requiredText(row.purchaseOrderItemId, "Purchase order item"),
      quantity,
      batchCode: row.batchCode === undefined || row.batchCode === ""
        ? null
        : requiredText(row.batchCode, "Batch code", 1, 100),
      expiryDate: parseDate(row.expiryDate),
    };
  });
  if (new Set(lines.map((line) => line.purchaseOrderItemId)).size !== lines.length) {
    throw new HttpError(400, "Each purchase order item can only appear once per receipt.");
  }
  return lines;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "STOREKEEPER"]);
    const { id: purchaseOrderId } = await context.params;
    const body = await readJson(request);
    const idempotencyKey = requiredText(body.idempotencyKey, "Receipt key", 8, 128);
    const note = body.note === undefined || body.note === ""
      ? null
      : requiredText(body.note, "Receipt note", 1, 500);
    const lines = parseLines(body.items);
    const campusId = scopedCampusId(session);

    const result = await prisma.$transaction(async (tx) => {
      const replay = await tx.purchaseReceipt.findFirst({
        where: { institutionId: session.membership.institutionId, idempotencyKey },
        select: { id: true, purchaseOrderId: true },
      });
      if (replay) {
        if (replay.purchaseOrderId !== purchaseOrderId) {
          throw new HttpError(409, "This receipt key was already used for another purchase order.");
        }
        return { receiptId: replay.id, replayed: true };
      }

      const orders = await tx.$queryRaw<Array<{
        id: string;
        status: string;
        campusId: string;
        storeId: string;
      }>>`
        SELECT id, status, campusId, storeId
        FROM PurchaseOrder
        WHERE id = ${purchaseOrderId}
          AND institutionId = ${session.membership.institutionId}
          ${campusId ? Prisma.sql`AND campusId = ${campusId}` : Prisma.empty}
        FOR UPDATE
      `;
      const order = orders[0];
      if (!order) throw new HttpError(404, "Purchase order not found.");
      if (order.status === "RECEIVED") throw new HttpError(409, "This purchase order is already fully received.");

      const requestedIds = lines.map((line) => line.purchaseOrderItemId);
      const orderItems = await tx.$queryRaw<Array<{
        id: string;
        ingredientId: string;
        orderedQuantity: string;
        receivedQuantity: string;
        unitCost: string | null;
      }>>`
        SELECT id, ingredientId, CAST(orderedQuantity AS CHAR) AS orderedQuantity,
          CAST(receivedQuantity AS CHAR) AS receivedQuantity,
          CAST(unitCost AS CHAR) AS unitCost
        FROM PurchaseOrderItem
        WHERE institutionId = ${session.membership.institutionId}
          AND purchaseOrderId = ${purchaseOrderId}
          AND id IN (${Prisma.join(requestedIds)})
        FOR UPDATE
      `;
      if (orderItems.length !== lines.length) throw new HttpError(400, "A receipt item does not belong to this purchase order.");
      const itemById = new Map(orderItems.map((item) => [item.id, item]));
      for (const line of lines) {
        const item = itemById.get(line.purchaseOrderItemId)!;
        const ordered = toMilliUnits(item.orderedQuantity);
        const received = toMilliUnits(item.receivedQuantity);
        const delivered = toMilliUnits(line.quantity);
        if (ordered === null || received === null || delivered === null || received + delivered > ordered) {
          throw new HttpError(409, "A receipt quantity exceeds the outstanding purchase order quantity.");
        }
      }

      const receipt = await tx.purchaseReceipt.create({
        data: {
          institutionId: session.membership.institutionId,
          campusId: order.campusId,
          storeId: order.storeId,
          purchaseOrderId,
          idempotencyKey,
          note,
        },
        select: { id: true },
      });
      for (const line of lines) {
        const item = itemById.get(line.purchaseOrderItemId)!;
        const ingredient = await tx.ingredient.findFirst({
          where: { id: item.ingredientId, institutionId: session.membership.institutionId, active: true },
          select: { id: true },
        });
        if (!ingredient) throw new HttpError(409, "An ordered ingredient is no longer available.");
        const batchId = randomUUID();
        const batchCode = line.batchCode ?? `PO-${purchaseOrderId.slice(0, 8).toUpperCase()}-${batchId.slice(0, 8).toUpperCase()}`;
        await tx.stockBatch.create({
          data: {
            id: batchId,
            institutionId: session.membership.institutionId,
            storeId: order.storeId,
            ingredientId: ingredient.id,
            batchCode,
            expiryDate: line.expiryDate,
            receivedQuantity: line.quantity,
            remainingQuantity: line.quantity,
            unitCost: item.unitCost,
          },
        });
        await tx.stockBalance.upsert({
          where: { storeId_ingredientId: { storeId: order.storeId, ingredientId: ingredient.id } },
          create: {
            institutionId: session.membership.institutionId,
            storeId: order.storeId,
            ingredientId: ingredient.id,
            onHand: line.quantity,
          },
          update: { onHand: { increment: line.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            institutionId: session.membership.institutionId,
            storeId: order.storeId,
            ingredientId: ingredient.id,
            batchId,
            kind: "RECEIPT",
            quantity: line.quantity,
            note: `Purchase order ${purchaseOrderId}${note ? `: ${note}` : ""}`,
          },
        });
        await tx.purchaseReceiptItem.create({
          data: {
            institutionId: session.membership.institutionId,
            purchaseReceiptId: receipt.id,
            purchaseOrderItemId: item.id,
            quantity: line.quantity,
            batchCode: line.batchCode,
            expiryDate: line.expiryDate,
          },
        });
        await tx.purchaseOrderItem.update({
          where: { id_institutionId: { id: item.id, institutionId: session.membership.institutionId } },
          data: { receivedQuantity: { increment: line.quantity } },
        });
      }

      const remaining = await tx.$queryRaw<Array<{ outstanding: bigint }>>`
        SELECT COUNT(*) AS outstanding
        FROM PurchaseOrderItem
        WHERE institutionId = ${session.membership.institutionId}
          AND purchaseOrderId = ${purchaseOrderId}
          AND receivedQuantity < orderedQuantity
      `;
      await tx.purchaseOrder.update({
        where: { id_institutionId: { id: purchaseOrderId, institutionId: session.membership.institutionId } },
        data: { status: Number(remaining[0]?.outstanding ?? 0n) === 0 ? "RECEIVED" : "PARTIALLY_RECEIVED" },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: "purchase_order.receive",
          entityType: "purchase_receipt",
          entityId: receipt.id,
        },
      });
      return { receiptId: receipt.id, replayed: false };
    }, { isolationLevel: "Serializable" });

    return NextResponse.json({ receiptId: result.receiptId, replayed: result.replayed }, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return jsonError(error);
  }
}
