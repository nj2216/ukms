import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireMembership, requireRole, scopedCampusId } from "@/lib/authorization";
import { HttpError, jsonError } from "@/lib/http";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "KITCHEN_STAFF", "PROCUREMENT_OFFICER", "FINANCE_OFFICER", "AUDITOR"]);
    const url = new URL(request.url);
    const campusId = scopedCampusId(session, url.searchParams.get("campusId"));
    const horizonDays = Number(url.searchParams.get("days") ?? "30");
    if (!Number.isSafeInteger(horizonDays) || horizonDays < 7 || horizonDays > 90) {
      throw new HttpError(400, "Forecast horizon must be between 7 and 90 days.");
    }
    const now = new Date();
    const lookbackStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29));
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const [ingredients, history, batches] = await Promise.all([
      prisma.ingredient.findMany({
        where: { institutionId: session.membership.institutionId, active: true },
        select: { id: true, name: true, unit: true, reorderLevel: true },
        orderBy: { name: "asc" },
        take: 2000,
      }),
      prisma.stockMovement.groupBy({
        by: ["ingredientId"],
        where: {
          institutionId: session.membership.institutionId,
          kind: { in: ["ISSUE", "WASTE"] },
          quantity: { lt: 0 },
          createdAt: { gte: lookbackStart },
          ...(campusId ? { store: { campusId } } : {}),
        },
        _sum: { quantity: true },
        _count: { id: true },
      }),
      prisma.stockBatch.findMany({
        where: {
          institutionId: session.membership.institutionId,
          remainingQuantity: { gt: 0 },
          OR: [{ expiryDate: null }, { expiryDate: { gte: todayStart } }],
          ...(campusId ? { store: { campusId } } : {}),
        },
        select: { ingredientId: true, remainingQuantity: true },
        take: 20000,
      }),
    ]);

    const historyByIngredient = new Map(history.map((entry) => [entry.ingredientId, entry]));
    const availability = new Map<string, Prisma.Decimal>();
    for (const batch of batches) {
      availability.set(
        batch.ingredientId,
        (availability.get(batch.ingredientId) ?? new Prisma.Decimal(0)).add(batch.remainingQuantity.toString()),
      );
    }
    const forecast = ingredients.map((ingredient) => {
      const observed = historyByIngredient.get(ingredient.id);
      const consumed = new Prisma.Decimal(observed?._sum.quantity?.toString() ?? "0").abs();
      const available = availability.get(ingredient.id) ?? new Prisma.Decimal(0);
      const reorderLevel = new Prisma.Decimal(ingredient.reorderLevel.toString());
      const projectedDemand = observed
        ? consumed.mul(horizonDays).div(30).toDecimalPlaces(3, Prisma.Decimal.ROUND_CEIL)
        : null;
      const recommendedPurchase = projectedDemand
        ? Prisma.Decimal.max(projectedDemand.add(reorderLevel).sub(available), 0).toDecimalPlaces(3, Prisma.Decimal.ROUND_CEIL)
        : null;
      return {
        ingredient: { id: ingredient.id, name: ingredient.name, unit: ingredient.unit },
        observedConsumption30Days: consumed.toFixed(3),
        availableNonExpired: available.toFixed(3),
        projectedDemand: projectedDemand?.toFixed(3) ?? null,
        recommendedPurchase: recommendedPurchase?.toFixed(3) ?? null,
        movementsObserved: observed?._count.id ?? 0,
        hasConsumptionHistory: Boolean(observed),
      };
    });
    return NextResponse.json({
      lookbackDays: 30,
      horizonDays,
      campusId: campusId ?? null,
      method: "Linear projection from the previous 30 calendar days of stock issues and raw-stock waste, plus ingredient reorder level.",
      forecast,
    });
  } catch (error) {
    return jsonError(error);
  }
}
