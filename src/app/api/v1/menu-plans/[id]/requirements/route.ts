import { NextResponse } from "next/server";
import { requireMembership, requireRole, scopedCampusId } from "@/lib/authorization";
import { calculateDemandQuantity, formatMilliUnits, toMilliUnits } from "@/lib/domain";
import { HttpError, jsonError } from "@/lib/http";
import { prisma } from "@/lib/db";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "KITCHEN_STAFF"]);
    const { id } = await context.params;
    const campusId = scopedCampusId(session);
    const menuPlan = await prisma.menuPlan.findFirst({
      where: {
        id,
        institutionId: session.membership.institutionId,
        ...(campusId ? { campusId } : {}),
      },
      select: {
        id: true,
        name: true,
        mealType: true,
        serviceDate: true,
        status: true,
        campus: { select: { id: true, name: true } },
        items: {
          select: {
            plannedServings: true,
            recipeVersion: {
              select: {
                servingYield: true,
                ingredients: {
                  select: {
                    quantity: true,
                    ingredient: { select: { id: true, name: true, unit: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!menuPlan) throw new HttpError(404, "Meal plan not found.");

    const requiredByIngredient = new Map<string, { id: string; name: string; unit: string; milliUnits: bigint }>();
    for (const item of menuPlan.items) {
      for (const recipeIngredient of item.recipeVersion.ingredients) {
        const quantity = calculateDemandQuantity(
          recipeIngredient.quantity.toString(),
          item.recipeVersion.servingYield,
          item.plannedServings,
        );
        const milliUnits = quantity ? toMilliUnits(quantity) : null;
        if (milliUnits === null) throw new Error("Stored recipe quantity could not be calculated.");
        const ingredient = recipeIngredient.ingredient;
        const current = requiredByIngredient.get(ingredient.id);
        requiredByIngredient.set(ingredient.id, {
          id: ingredient.id,
          name: ingredient.name,
          unit: ingredient.unit,
          milliUnits: (current?.milliUnits ?? 0n) + milliUnits,
        });
      }
    }

    const ingredientIds = [...requiredByIngredient.keys()];
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const [availableBatches, expiredBatches] = ingredientIds.length
      ? await Promise.all([
          prisma.stockBatch.findMany({
            where: {
              institutionId: session.membership.institutionId,
              ingredientId: { in: ingredientIds },
              store: { campusId: menuPlan.campus.id },
              remainingQuantity: { gt: 0 },
              OR: [{ expiryDate: null }, { expiryDate: { gte: todayStart } }],
            },
            select: { ingredientId: true, remainingQuantity: true },
          }),
          prisma.stockBatch.findMany({
            where: {
              institutionId: session.membership.institutionId,
              ingredientId: { in: ingredientIds },
              store: { campusId: menuPlan.campus.id },
              remainingQuantity: { gt: 0 },
              expiryDate: { lt: todayStart },
            },
            select: { ingredientId: true, remainingQuantity: true },
          }),
        ])
      : [[], []];

    const availability = new Map<string, bigint>();
    const expiredAvailability = new Map<string, bigint>();
    for (const batch of availableBatches) {
      const quantity = toMilliUnits(batch.remainingQuantity.toString());
      if (quantity === null) throw new Error("Stored batch quantity could not be read.");
      availability.set(batch.ingredientId, (availability.get(batch.ingredientId) ?? 0n) + quantity);
    }
    for (const batch of expiredBatches) {
      const quantity = toMilliUnits(batch.remainingQuantity.toString());
      if (quantity === null) throw new Error("Stored batch quantity could not be read.");
      expiredAvailability.set(batch.ingredientId, (expiredAvailability.get(batch.ingredientId) ?? 0n) + quantity);
    }

    const requirements = [...requiredByIngredient.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((ingredient) => {
        const available = availability.get(ingredient.id) ?? 0n;
        const shortage = ingredient.milliUnits > available ? ingredient.milliUnits - available : 0n;
        return {
          id: ingredient.id,
          name: ingredient.name,
          unit: ingredient.unit,
          required: formatMilliUnits(ingredient.milliUnits),
          available: formatMilliUnits(available),
          expired: formatMilliUnits(expiredAvailability.get(ingredient.id) ?? 0n),
          shortage: formatMilliUnits(shortage),
          sufficient: shortage === 0n,
        };
      });

    return NextResponse.json({
      menuPlan: {
        id: menuPlan.id,
        name: menuPlan.name,
        mealType: menuPlan.mealType,
        serviceDate: menuPlan.serviceDate,
        status: menuPlan.status,
        campus: menuPlan.campus,
      },
      requirements,
      availabilityNote: "Availability includes stock with no expiry date and excludes known expired batches.",
    });
  } catch (error) {
    return jsonError(error);
  }
}
