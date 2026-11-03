import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireMembership, scopedCampusId } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const session = await requireMembership(request);
    const campusId = scopedCampusId(session);
    const institutionId = session.membership.institutionId;
    const campusCondition = campusId
      ? Prisma.sql`AND store.campusId = ${campusId}`
      : Prisma.empty;
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const expiryWindowEnd = new Date(todayStart.getTime() + 30 * 24 * 60 * 60 * 1000);
    const batchScope = {
      institutionId,
      remainingQuantity: { gt: 0 },
      ...(campusId ? { store: { campusId } } : {}),
    };

    const [counts, lowStock, ingredientCount, storeCount, movementCount, recentMovements, expiredBatches, expiringBatches, expiryAttention] =
      await Promise.all([
        prisma.$queryRaw<Array<{ stockPositions: bigint; reorderAlerts: bigint }>>`
          SELECT
            COUNT(*) AS stockPositions,
            COALESCE(SUM(CASE WHEN balance.onHand <= ingredient.reorderLevel THEN 1 ELSE 0 END), 0) AS reorderAlerts
          FROM StockBalance AS balance
          INNER JOIN Ingredient AS ingredient
            ON ingredient.id = balance.ingredientId
            AND ingredient.institutionId = balance.institutionId
          INNER JOIN Store AS store
            ON store.id = balance.storeId
            AND store.institutionId = balance.institutionId
          WHERE balance.institutionId = ${institutionId}
            ${campusCondition}
        `,
        prisma.$queryRaw<Array<{
          id: string;
          ingredientName: string;
          unit: string;
          storeName: string;
          campusName: string;
          onHand: string;
          reorderLevel: string;
        }>>`
          SELECT
            balance.id,
            ingredient.name AS ingredientName,
            ingredient.unit,
            store.name AS storeName,
            campus.name AS campusName,
            CAST(balance.onHand AS CHAR) AS onHand,
            CAST(ingredient.reorderLevel AS CHAR) AS reorderLevel
          FROM StockBalance AS balance
          INNER JOIN Ingredient AS ingredient
            ON ingredient.id = balance.ingredientId
            AND ingredient.institutionId = balance.institutionId
          INNER JOIN Store AS store
            ON store.id = balance.storeId
            AND store.institutionId = balance.institutionId
          INNER JOIN Campus AS campus
            ON campus.id = store.campusId
            AND campus.institutionId = store.institutionId
          WHERE balance.institutionId = ${institutionId}
            AND balance.onHand <= ingredient.reorderLevel
            ${campusCondition}
          ORDER BY balance.onHand ASC, ingredient.name ASC
          LIMIT 6
        `,
        prisma.ingredient.count({ where: { institutionId, active: true } }),
        prisma.store.count({
          where: { institutionId, ...(campusId ? { campusId } : {}) },
        }),
        prisma.stockMovement.count({
          where: { institutionId, ...(campusId ? { store: { campusId } } : {}) },
        }),
        prisma.stockMovement.findMany({
          where: { institutionId, ...(campusId ? { store: { campusId } } : {}) },
          select: {
            id: true,
            kind: true,
            quantity: true,
            createdAt: true,
            store: { select: { name: true, campus: { select: { name: true } } } },
            ingredient: { select: { name: true, unit: true } },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 6,
        }),
        prisma.stockBatch.count({
          where: { ...batchScope, expiryDate: { lt: todayStart } },
        }),
        prisma.stockBatch.count({
          where: {
            ...batchScope,
            expiryDate: { gte: todayStart, lte: expiryWindowEnd },
          },
        }),
        prisma.stockBatch.findMany({
          where: {
            ...batchScope,
            expiryDate: { lte: expiryWindowEnd },
          },
          select: {
            id: true,
            batchCode: true,
            expiryDate: true,
            remainingQuantity: true,
            store: { select: { name: true, campus: { select: { name: true } } } },
            ingredient: { select: { name: true, unit: true } },
          },
          orderBy: [{ expiryDate: "asc" }, { id: "asc" }],
          take: 6,
        }),
      ]);

    const expiryAttentionRows = expiryAttention.map((batch) => {
      const expiryDate = batch.expiryDate!;
      const dateOnly = new Date(Date.UTC(expiryDate.getUTCFullYear(), expiryDate.getUTCMonth(), expiryDate.getUTCDate()));
      return {
        ...batch,
        daysUntilExpiry: Math.floor((dateOnly.getTime() - todayStart.getTime()) / (24 * 60 * 60 * 1000)),
      };
    });

    return NextResponse.json({
      metrics: {
        stockPositions: Number(counts[0]?.stockPositions ?? 0n),
        reorderAlerts: Number(counts[0]?.reorderAlerts ?? 0n),
        ingredients: ingredientCount,
        stores: storeCount,
        movements: movementCount,
        expiredBatches,
        expiringBatches,
      },
      lowStock: lowStock.map((item) => ({
        ...item,
        belowReorderLevel: true,
      })),
      recentMovements,
      expiryAttention: expiryAttentionRows,
      campusName: session.membership.campus?.name ?? null,
    });
  } catch (error) {
    return jsonError(error);
  }
}
