import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { requireMembership, requireRole, scopedCampusId } from "@/lib/authorization";
import { assertSameOrigin, HttpError, jsonError, readJson, requiredText } from "@/lib/http";
import { allocateStockBatches, movementQuantity, toMilliUnits, type StockKind } from "@/lib/domain";
import { prisma } from "@/lib/db";

const stockKinds: StockKind[] = ["RECEIPT", "ISSUE", "WASTE", "ADJUSTMENT"];

export async function GET(request: Request) {
  try {
    const session = await requireMembership(request);
    const url = new URL(request.url);
    const campusId = scopedCampusId(session, url.searchParams.get("campusId"));
    const cursor = url.searchParams.get("cursor") || undefined;
    if (cursor && cursor.length > 191) {
      throw new HttpError(400, "Invalid movement cursor.");
    }

    const movements = await prisma.stockMovement.findMany({
      where: {
        institutionId: session.membership.institutionId,
        ...(campusId ? { store: { campusId } } : {}),
      },
      select: {
        id: true,
        kind: true,
        quantity: true,
        note: true,
        createdAt: true,
        store: { select: { name: true, campus: { select: { name: true } } } },
        ingredient: { select: { name: true, unit: true } },
        batch: { select: { batchCode: true, expiryDate: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    return NextResponse.json({
      movements,
      nextCursor: movements.length === 50 ? movements.at(-1)?.id : null,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "STOREKEEPER", "KITCHEN_STAFF"]);
    const body = await readJson(request);
    const storeId = requiredText(body.storeId, "Store");
    const ingredientId = requiredText(body.ingredientId, "Ingredient");
    const kind = body.kind;
    if (typeof kind !== "string" || !stockKinds.includes(kind as StockKind)) {
      throw new HttpError(400, "Choose a valid stock movement type.");
    }
    if (session.membership.role === "KITCHEN_STAFF" && kind !== "ISSUE") {
      throw new HttpError(403, "Kitchen staff can only issue stock.");
    }
    const campusId = typeof body.campusId === "string" ? body.campusId : null;
    const allowedCampus = scopedCampusId(session, campusId);
    const store = await prisma.store.findFirst({
      where: {
        id: storeId,
        institutionId: session.membership.institutionId,
        ...(allowedCampus ? { campusId: allowedCampus } : {}),
      },
      select: { id: true, campusId: true },
    });
    if (!store) throw new HttpError(404, "Store not found.");
    const ingredient = await prisma.ingredient.findFirst({
      where: { id: ingredientId, institutionId: session.membership.institutionId, active: true },
      select: { id: true },
    });
    if (!ingredient) throw new HttpError(404, "Ingredient not found.");

    const quantity = movementQuantity(kind as StockKind, String(body.quantity ?? ""));
    if (!quantity) {
      throw new HttpError(
        400,
        kind === "ADJUSTMENT"
          ? "Adjustment must be a non-zero signed quantity with up to 3 decimal places."
          : "Quantity must be a positive number with up to 3 decimal places.",
      );
    }
    const note = body.note === undefined || body.note === "" ? null : requiredText(body.note, "Note", 1, 500);
    const batchCode = kind === "RECEIPT" && body.batchCode !== undefined && body.batchCode !== ""
      ? requiredText(body.batchCode, "Batch code", 1, 100)
      : null;
    let expiryDate: Date | null = null;
    if (kind === "RECEIPT" && body.expiryDate !== undefined && body.expiryDate !== "") {
      if (typeof body.expiryDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.expiryDate)) {
        throw new HttpError(400, "Expiry date must be a valid calendar date.");
      }
      expiryDate = new Date(`${body.expiryDate}T00:00:00.000Z`);
      if (Number.isNaN(expiryDate.getTime()) || expiryDate.toISOString().slice(0, 10) !== body.expiryDate) {
        throw new HttpError(400, "Expiry date must be a valid calendar date.");
      }
    }
    const signedMilliUnits =
      quantity.startsWith("-")
        ? -(toMilliUnits(quantity.slice(1)) ?? 0n)
        : (toMilliUnits(quantity) ?? 0n);
    const amount = quantity.startsWith("-") ? quantity.slice(1) : quantity;

    const movements = await prisma.$transaction(async (tx) => {
      const unique = {
        storeId_ingredientId: { storeId: store.id, ingredientId: ingredient.id },
      };
      let newBatchId: string | null = null;
      if (signedMilliUnits < 0n) {
        const rows = await tx.$queryRaw<Array<{ onHand: string }>>`
          SELECT CAST(onHand AS CHAR) AS onHand
          FROM StockBalance
          WHERE institutionId = ${session.membership.institutionId}
            AND storeId = ${store.id}
            AND ingredientId = ${ingredient.id}
          FOR UPDATE
        `;
        const current = rows[0] ? toMilliUnits(String(rows[0].onHand)) : null;
        if (current === null || current < -signedMilliUnits) {
          throw new HttpError(409, "There is not enough stock for this movement.");
        }
        const now = new Date();
        const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const expiryCondition = kind === "ISSUE"
          ? Prisma.sql`AND (expiryDate IS NULL OR expiryDate >= ${todayStart})`
          : Prisma.empty;
        const batchRows = await tx.$queryRaw<Array<{ id: string; remainingQuantity: string }>>`
          SELECT id, CAST(remainingQuantity AS CHAR) AS remainingQuantity
          FROM StockBatch
          WHERE institutionId = ${session.membership.institutionId}
            AND storeId = ${store.id}
            AND ingredientId = ${ingredient.id}
            AND remainingQuantity > 0
            ${expiryCondition}
          ORDER BY expiryDate IS NULL ASC, expiryDate ASC, receivedAt ASC, id ASC
          FOR UPDATE
        `;
        const allocations = allocateStockBatches(batchRows, amount);
        if (!allocations) {
          if (kind === "ISSUE") {
            throw new HttpError(409, "There is not enough non-expired stock for this issue.");
          }
          throw new HttpError(409, "Available batch quantities do not match the stock balance. Review the inventory before issuing stock.");
        }
        await tx.stockBalance.update({
          where: unique,
          data: { onHand: { decrement: amount } },
        });
        const createdMovements = [];
        for (const allocation of allocations) {
          await tx.stockBatch.update({
            where: { id: allocation.batchId, institutionId: session.membership.institutionId },
            data: { remainingQuantity: { decrement: allocation.quantity } },
          });
          const created = await tx.stockMovement.create({
            data: {
              institutionId: session.membership.institutionId,
              storeId: store.id,
              ingredientId: ingredient.id,
              batchId: allocation.batchId,
              kind: kind as StockKind,
              quantity: `-${allocation.quantity}`,
              note,
            },
            select: { id: true, kind: true, quantity: true, createdAt: true },
          });
          await tx.auditEvent.create({
            data: {
              institutionId: session.membership.institutionId,
              actorId: session.userId,
              action: `inventory.${kind.toLowerCase()}`,
              entityType: "stock_movement",
              entityId: created.id,
            },
          });
          createdMovements.push(created);
        }
        return createdMovements;
      } else {
        newBatchId = randomUUID();
        await tx.stockBatch.create({
          data: {
            id: newBatchId,
            institutionId: session.membership.institutionId,
            storeId: store.id,
            ingredientId: ingredient.id,
            batchCode: batchCode ?? `${kind === "RECEIPT" ? "LOT" : "ADJ"}-${newBatchId.slice(0, 8).toUpperCase()}`,
            expiryDate,
            receivedQuantity: amount,
            remainingQuantity: amount,
          },
        });
        await tx.stockBalance.upsert({
          where: unique,
          create: {
            institutionId: session.membership.institutionId,
            storeId: store.id,
            ingredientId: ingredient.id,
            onHand: amount,
          },
          update: { onHand: { increment: amount } },
        });
      }

      const created = await tx.stockMovement.create({
        data: {
          institutionId: session.membership.institutionId,
          storeId: store.id,
          ingredientId: ingredient.id,
          batchId: newBatchId,
          kind: kind as StockKind,
          quantity,
          note,
        },
        select: { id: true, kind: true, quantity: true, createdAt: true },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: `inventory.${kind.toLowerCase()}`,
          entityType: "stock_movement",
          entityId: created.id,
        },
      });
      return [created];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ movement: movements[0], movements }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
