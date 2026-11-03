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

    const [counts, lowStock, ingredientCount, storeCount, movementCount, recentMovements] =
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
      ]);

    return NextResponse.json({
      metrics: {
        stockPositions: Number(counts[0]?.stockPositions ?? 0n),
        reorderAlerts: Number(counts[0]?.reorderAlerts ?? 0n),
        ingredients: ingredientCount,
        stores: storeCount,
        movements: movementCount,
      },
      lowStock: lowStock.map((item) => ({
        ...item,
        belowReorderLevel: true,
      })),
      recentMovements,
      campusName: session.membership.campus?.name ?? null,
    });
  } catch (error) {
    return jsonError(error);
  }
}
