import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireMembership, requireRole, scopedCampusId } from "@/lib/authorization";
import { toMilliUnits } from "@/lib/domain";
import { addStockBatch, consumeStock } from "@/lib/stock-transaction";
import { assertSameOrigin, HttpError, jsonError, readJson, requiredText } from "@/lib/http";
import { prisma } from "@/lib/db";

function parseItems(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new HttpError(400, "Add at least one ingredient to the transfer.");
  }
  const items = value.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new HttpError(400, "Each transfer item needs an ingredient and quantity.");
    }
    const row = value as Record<string, unknown>;
    const quantity = String(row.quantity ?? "");
    const parsed = toMilliUnits(quantity);
    if (parsed === null || parsed <= 0n) throw new HttpError(400, "Transfer quantities must be positive with up to 3 decimal places.");
    return { ingredientId: requiredText(row.ingredientId, "Ingredient"), quantity };
  });
  if (new Set(items.map((item) => item.ingredientId)).size !== items.length) {
    throw new HttpError(400, "Each ingredient can appear only once per transfer.");
  }
  return items;
}

export async function GET(request: Request) {
  try {
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "STOREKEEPER"]);
    const campusId = scopedCampusId(session, new URL(request.url).searchParams.get("campusId"));
    const transfers = await prisma.stockTransfer.findMany({
      where: {
        institutionId: session.membership.institutionId,
        ...(campusId ? { OR: [{ originCampusId: campusId }, { destinationCampusId: campusId }] } : {}),
      },
      select: {
        id: true,
        note: true,
        createdAt: true,
        originCampus: { select: { id: true, name: true } },
        destinationCampus: { select: { id: true, name: true } },
        originStore: { select: { id: true, name: true } },
        destinationStore: { select: { id: true, name: true } },
        items: {
          select: {
            id: true,
            quantity: true,
            ingredient: { select: { id: true, name: true, unit: true } },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    return NextResponse.json({ transfers });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "STOREKEEPER"]);
    const body = await readJson(request);
    const originStoreId = requiredText(body.originStoreId, "Origin store");
    const destinationStoreId = requiredText(body.destinationStoreId, "Destination store");
    if (originStoreId === destinationStoreId) throw new HttpError(400, "Choose different origin and destination stores.");
    const note = body.note === undefined || body.note === "" ? null : requiredText(body.note, "Transfer note", 1, 500);
    const items = parseItems(body.items);
    const institutionId = session.membership.institutionId;
    const [origin, destination, ingredients] = await Promise.all([
      prisma.store.findFirst({ where: { id: originStoreId, institutionId }, select: { id: true, campusId: true, name: true } }),
      prisma.store.findFirst({ where: { id: destinationStoreId, institutionId }, select: { id: true, campusId: true, name: true } }),
      prisma.ingredient.findMany({
        where: { id: { in: items.map((item) => item.ingredientId) }, institutionId, active: true },
        select: { id: true },
      }),
    ]);
    if (!origin || !destination) throw new HttpError(404, "Origin or destination store not found.");
    scopedCampusId(session, origin.campusId);
    scopedCampusId(session, destination.campusId);
    if (ingredients.length !== items.length) throw new HttpError(400, "One or more ingredients are unavailable.");

    const transferId = randomUUID();
    const transfer = await prisma.$transaction(async (tx) => {
      const created = await tx.stockTransfer.create({
        data: {
          id: transferId,
          institutionId,
          originCampusId: origin.campusId,
          destinationCampusId: destination.campusId,
          originStoreId,
          destinationStoreId,
          note,
        },
        select: { id: true },
      });
      for (const item of items) {
        const consumption = await consumeStock(tx, {
          institutionId,
          actorId: session.userId,
          storeId: originStoreId,
          ingredientId: item.ingredientId,
          quantity: item.quantity,
          kind: "TRANSFER_OUT",
          allowExpired: true,
          transferId: created.id,
          note: `Transfer ${created.id}${note ? `: ${note}` : ""}`,
        });
        await tx.stockTransferItem.create({
          data: {
            institutionId,
            stockTransferId: created.id,
            ingredientId: item.ingredientId,
            quantity: item.quantity,
          },
        });
        for (const allocation of consumption.allocations) {
          await addStockBatch(tx, {
            institutionId,
            actorId: session.userId,
            storeId: destinationStoreId,
            ingredientId: item.ingredientId,
            quantity: allocation.quantity,
            batchCode: allocation.batchCode,
            expiryDate: allocation.expiryDate,
            unitCost: allocation.unitCost,
            transferId: created.id,
            note: `Transfer ${created.id} received from ${origin.name}`,
          });
        }
      }
      await tx.auditEvent.create({
        data: { institutionId, actorId: session.userId, action: "stock_transfer.complete", entityType: "stock_transfer", entityId: created.id },
      });
      return tx.stockTransfer.findFirstOrThrow({
        where: { id: created.id, institutionId },
        select: {
          id: true,
          note: true,
          createdAt: true,
          originCampus: { select: { id: true, name: true } },
          destinationCampus: { select: { id: true, name: true } },
          originStore: { select: { id: true, name: true } },
          destinationStore: { select: { id: true, name: true } },
          items: { select: { id: true, quantity: true, ingredient: { select: { id: true, name: true, unit: true } } } },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ transfer }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
