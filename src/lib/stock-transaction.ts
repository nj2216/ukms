import { randomUUID } from "node:crypto";
import { Prisma, type StockMovementKind } from "@/generated/prisma/client";
import { allocateStockBatches, toMilliUnits } from "@/lib/domain";
import { HttpError } from "@/lib/http";

type Transaction = Prisma.TransactionClient;

export async function consumeStock(
  tx: Transaction,
  input: {
    institutionId: string;
    actorId: string;
    storeId: string;
    ingredientId: string;
    quantity: string;
    kind: Extract<StockMovementKind, "ISSUE" | "WASTE" | "TRANSFER_OUT">;
    note: string;
    transferId?: string;
    allowExpired?: boolean;
  },
) {
  const rows = await tx.$queryRaw<Array<{ onHand: string }>>`
    SELECT CAST(onHand AS CHAR) AS onHand
    FROM StockBalance
    WHERE institutionId = ${input.institutionId}
      AND storeId = ${input.storeId}
      AND ingredientId = ${input.ingredientId}
    FOR UPDATE
  `;
  const requested = toMilliUnits(input.quantity);
  const onHand = rows[0] ? toMilliUnits(rows[0].onHand) : null;
  if (requested === null || requested <= 0n || onHand === null || onHand < requested) {
    throw new HttpError(409, "There is not enough stock for this operation.");
  }

  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const expiryFilter = input.kind === "ISSUE" && !input.allowExpired
    ? Prisma.sql`AND (expiryDate IS NULL OR expiryDate >= ${todayStart})`
    : Prisma.empty;
  const batches = await tx.$queryRaw<Array<{
    id: string;
    batchCode: string;
    expiryDate: Date | null;
    remainingQuantity: string;
    unitCost: string | null;
  }>>`
    SELECT id, batchCode, expiryDate,
      CAST(remainingQuantity AS CHAR) AS remainingQuantity,
      CAST(unitCost AS CHAR) AS unitCost
    FROM StockBatch
    WHERE institutionId = ${input.institutionId}
      AND storeId = ${input.storeId}
      AND ingredientId = ${input.ingredientId}
      AND remainingQuantity > 0
      ${expiryFilter}
    ORDER BY expiryDate IS NULL ASC, expiryDate ASC, receivedAt ASC, id ASC
    FOR UPDATE
  `;
  const allocations = allocateStockBatches(batches, input.quantity);
  if (!allocations) {
    throw new HttpError(409, "Available batch quantities do not cover the requested stock operation.");
  }

  await tx.stockBalance.update({
    where: { storeId_ingredientId: { storeId: input.storeId, ingredientId: input.ingredientId } },
    data: { onHand: { decrement: input.quantity } },
  });
  let totalCost = new Prisma.Decimal(0);
  let costKnown = true;
  const consumed = [];
  for (const allocation of allocations) {
    const batch = batches.find((candidate) => candidate.id === allocation.batchId)!;
    await tx.stockBatch.update({
      where: { id_institutionId: { id: batch.id, institutionId: input.institutionId } },
      data: { remainingQuantity: { decrement: allocation.quantity } },
    });
    const movement = await tx.stockMovement.create({
      data: {
        institutionId: input.institutionId,
        storeId: input.storeId,
        ingredientId: input.ingredientId,
        batchId: batch.id,
        transferId: input.transferId,
        kind: input.kind,
        quantity: `-${allocation.quantity}`,
        note: input.note,
      },
      select: { id: true },
    });
    await tx.auditEvent.create({
      data: {
        institutionId: input.institutionId,
        actorId: input.actorId,
        action: `inventory.${input.kind.toLowerCase()}`,
        entityType: "stock_movement",
        entityId: movement.id,
      },
    });
    if (batch.unitCost === null) costKnown = false;
    else totalCost = totalCost.add(new Prisma.Decimal(allocation.quantity).mul(batch.unitCost));
    consumed.push({
      batchCode: batch.batchCode,
      expiryDate: batch.expiryDate,
      quantity: allocation.quantity,
      unitCost: batch.unitCost,
    });
  }
  return {
    allocations: consumed,
    totalCost: costKnown ? totalCost : null,
  };
}

export async function addStockBatch(
  tx: Transaction,
  input: {
    institutionId: string;
    actorId: string;
    storeId: string;
    ingredientId: string;
    quantity: string;
    batchCode: string;
    expiryDate: Date | null;
    unitCost: string | null;
    transferId: string;
    note: string;
  },
) {
  const batchId = randomUUID();
  await tx.stockBatch.create({
    data: {
      id: batchId,
      institutionId: input.institutionId,
      storeId: input.storeId,
      ingredientId: input.ingredientId,
      batchCode: input.batchCode,
      expiryDate: input.expiryDate,
      receivedQuantity: input.quantity,
      remainingQuantity: input.quantity,
      unitCost: input.unitCost,
    },
  });
  await tx.stockBalance.upsert({
    where: { storeId_ingredientId: { storeId: input.storeId, ingredientId: input.ingredientId } },
    create: {
      institutionId: input.institutionId,
      storeId: input.storeId,
      ingredientId: input.ingredientId,
      onHand: input.quantity,
    },
    update: { onHand: { increment: input.quantity } },
  });
  const movement = await tx.stockMovement.create({
    data: {
      institutionId: input.institutionId,
      storeId: input.storeId,
      ingredientId: input.ingredientId,
      batchId,
      transferId: input.transferId,
      kind: "TRANSFER_IN",
      quantity: input.quantity,
      note: input.note,
    },
    select: { id: true },
  });
  await tx.auditEvent.create({
    data: {
      institutionId: input.institutionId,
      actorId: input.actorId,
      action: "inventory.transfer_in",
      entityType: "stock_movement",
      entityId: movement.id,
    },
  });
}
