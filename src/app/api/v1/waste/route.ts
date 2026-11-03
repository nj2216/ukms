import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireMembership, requireRole, scopedCampusId } from "@/lib/authorization";
import { toMilliUnits } from "@/lib/domain";
import { assertSameOrigin, HttpError, jsonError, readJson, requiredText } from "@/lib/http";
import { consumeStock } from "@/lib/stock-transaction";
import { prisma } from "@/lib/db";

const categories = ["RAW_INGREDIENT", "PREPARED_MEAL", "LEFTOVER", "SPOILAGE"] as const;

export async function GET(request: Request) {
  try {
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "KITCHEN_STAFF", "STOREKEEPER"]);
    const campusId = scopedCampusId(session, new URL(request.url).searchParams.get("campusId"));
    const records = await prisma.wasteRecord.findMany({
      where: { institutionId: session.membership.institutionId, ...(campusId ? { campusId } : {}) },
      select: {
        id: true,
        category: true,
        quantity: true,
        unit: true,
        estimatedCost: true,
        reason: true,
        createdAt: true,
        campus: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
        ingredient: { select: { id: true, name: true } },
        productionRun: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    return NextResponse.json({ records });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "KITCHEN_STAFF", "STOREKEEPER"]);
    const body = await readJson(request);
    if (typeof body.category !== "string" || !categories.includes(body.category as (typeof categories)[number])) {
      throw new HttpError(400, "Choose a valid waste category.");
    }
    const category = body.category as (typeof categories)[number];
    if (
      session.membership.role === "STOREKEEPER" &&
      category !== "RAW_INGREDIENT" &&
      category !== "SPOILAGE"
    ) {
      throw new HttpError(403, "Storekeepers can record raw ingredient waste only.");
    }
    const quantity = String(body.quantity ?? "");
    const quantityUnits = toMilliUnits(quantity);
    if (quantityUnits === null || quantityUnits <= 0n) throw new HttpError(400, "Waste quantity must be positive with up to 3 decimal places.");
    const reason = requiredText(body.reason, "Waste reason", 1, 500);
    const requestedCampus = typeof body.campusId === "string" ? body.campusId : session.membership.campusId;
    const campusId = scopedCampusId(session, requestedCampus);
    if (!campusId) throw new HttpError(400, "A campus is required.");
    const institutionId = session.membership.institutionId;

    if (category === "RAW_INGREDIENT" || category === "SPOILAGE") {
      const storeId = requiredText(body.storeId, "Store");
      const ingredientId = requiredText(body.ingredientId, "Ingredient");
      const [store, ingredient] = await Promise.all([
        prisma.store.findFirst({ where: { id: storeId, campusId, institutionId }, select: { id: true } }),
        prisma.ingredient.findFirst({ where: { id: ingredientId, institutionId, active: true }, select: { id: true, unit: true } }),
      ]);
      if (!store) throw new HttpError(404, "Store not found in the selected campus.");
      if (!ingredient) throw new HttpError(404, "Ingredient not found.");
      const result = await prisma.$transaction(async (tx) => {
        const record = await tx.wasteRecord.create({
          data: {
            institutionId, campusId, storeId, ingredientId, category, quantity,
            unit: ingredient.unit, reason,
          },
          select: { id: true },
        });
        const consumed = await consumeStock(tx, {
          institutionId,
          actorId: session.userId,
          storeId,
          ingredientId,
          quantity,
          kind: "WASTE",
          allowExpired: true,
          note: `Waste record ${record.id}: ${reason}`,
        });
        await tx.wasteRecord.update({
          where: { id_institutionId: { id: record.id, institutionId } },
          data: { estimatedCost: consumed.totalCost?.toDecimalPlaces(4).toFixed(4) ?? null },
        });
        await tx.auditEvent.create({
          data: { institutionId, actorId: session.userId, action: "waste_record.create", entityType: "waste_record", entityId: record.id },
        });
        return record;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return NextResponse.json({ wasteRecord: result }, { status: 201 });
    }

    const productionRunId = requiredText(body.productionRunId, "Production run");
    const result = await prisma.$transaction(async (tx) => {
      const run = await tx.productionRun.findFirst({
        where: { id: productionRunId, institutionId, campusId },
        select: { id: true, preparedServings: true, leftoverServings: true, totalCost: true },
      });
      if (!run) throw new HttpError(404, "Production run not found for this campus.");
      const existing = await tx.wasteRecord.aggregate({
        where: { productionRunId, institutionId, category },
        _sum: { quantity: true },
      });
      const ceiling = category === "LEFTOVER" ? run.leftoverServings : run.preparedServings;
      const recorded = new Prisma.Decimal(existing._sum.quantity?.toString() ?? "0");
      if (recorded.add(quantity).greaterThan(ceiling)) {
        throw new HttpError(409, "Recorded meal waste cannot exceed the run's available servings.");
      }
      const estimatedCost = run.totalCost === null
        ? null
        : run.totalCost.div(run.preparedServings).mul(quantity).toDecimalPlaces(4).toFixed(4);
      const created = await tx.wasteRecord.create({
        data: {
          institutionId,
          campusId,
          productionRunId,
          category,
          quantity,
          unit: "servings",
          estimatedCost,
          reason,
        },
        select: { id: true, category: true, quantity: true, estimatedCost: true },
      });
      await tx.auditEvent.create({
        data: { institutionId, actorId: session.userId, action: "waste_record.create", entityType: "waste_record", entityId: created.id },
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ wasteRecord: result }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
