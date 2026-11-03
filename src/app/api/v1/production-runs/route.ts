import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireMembership, requireRole, scopedCampusId } from "@/lib/authorization";
import { toMilliUnits } from "@/lib/domain";
import { assertSameOrigin, HttpError, jsonError, readJson, requiredText } from "@/lib/http";
import { consumeStock } from "@/lib/stock-transaction";
import { prisma } from "@/lib/db";

type IssueInput = { ingredientId: string; quantity: string };

function parseIssues(value: unknown): IssueInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new HttpError(400, "Add at least one ingredient issue to the production record.");
  }
  const issues = value.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new HttpError(400, "Each issue must include an ingredient and quantity.");
    }
    const row = value as Record<string, unknown>;
    const quantity = String(row.quantity ?? "");
    const parsed = toMilliUnits(quantity);
    if (parsed === null || parsed <= 0n) throw new HttpError(400, "Issue quantities must be positive with up to 3 decimal places.");
    return { ingredientId: requiredText(row.ingredientId, "Ingredient"), quantity };
  });
  if (new Set(issues.map((row) => row.ingredientId)).size !== issues.length) {
    throw new HttpError(400, "Each ingredient can appear only once in a production record.");
  }
  return issues;
}

function servings(value: unknown, label: string) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0 || count > 1_000_000) {
    throw new HttpError(400, `${label} must be a whole number between 0 and 1,000,000.`);
  }
  return count;
}

export async function GET(request: Request) {
  try {
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "KITCHEN_STAFF"]);
    const campusId = scopedCampusId(session, new URL(request.url).searchParams.get("campusId"));
    const runs = await prisma.productionRun.findMany({
      where: { institutionId: session.membership.institutionId, ...(campusId ? { campusId } : {}) },
      select: {
        id: true,
        name: true,
        preparedServings: true,
        servedServings: true,
        leftoverServings: true,
        totalCost: true,
        createdAt: true,
        campus: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
        menuPlan: { select: { id: true, name: true, serviceDate: true } },
        issues: {
          select: {
            id: true,
            quantity: true,
            unitCost: true,
            ingredient: { select: { id: true, name: true, unit: true } },
          },
        },
        wasteRecords: {
          select: { id: true, category: true, quantity: true, unit: true, estimatedCost: true, reason: true },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    return NextResponse.json({ runs });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "KITCHEN_STAFF"]);
    const body = await readJson(request);
    const storeId = requiredText(body.storeId, "Store");
    const campusId = scopedCampusId(session, typeof body.campusId === "string" ? body.campusId : null);
    if (!campusId) throw new HttpError(400, "A campus is required.");
    const preparedServings = servings(body.preparedServings, "Prepared servings");
    const servedServings = servings(body.servedServings, "Served servings");
    const leftoverServings = servings(body.leftoverServings, "Leftover servings");
    if (preparedServings < 1 || servedServings + leftoverServings > preparedServings) {
      throw new HttpError(400, "Served and leftover servings cannot exceed the prepared quantity.");
    }
    const menuPlanId = body.menuPlanId ? requiredText(body.menuPlanId, "Meal plan") : null;
    const note = body.note === undefined || body.note === "" ? null : requiredText(body.note, "Note", 1, 500);
    const issues = parseIssues(body.items);
    const [store, ingredients, menuPlan] = await Promise.all([
      prisma.store.findFirst({
        where: { id: storeId, campusId, institutionId: session.membership.institutionId },
        select: { id: true },
      }),
      prisma.ingredient.findMany({
        where: { id: { in: issues.map((item) => item.ingredientId) }, institutionId: session.membership.institutionId, active: true },
        select: { id: true },
      }),
      menuPlanId ? prisma.menuPlan.findFirst({
        where: { id: menuPlanId, campusId, institutionId: session.membership.institutionId, status: "PUBLISHED" },
        select: { id: true, name: true },
      }) : Promise.resolve(null),
    ]);
    if (!store) throw new HttpError(404, "Production store not found in the selected campus.");
    if (ingredients.length !== issues.length) throw new HttpError(400, "One or more ingredients are unavailable.");
    if (menuPlanId && !menuPlan) throw new HttpError(404, "Published meal plan not found in the selected campus.");

    const runId = randomUUID();
    const run = await prisma.$transaction(async (tx) => {
      const created = await tx.productionRun.create({
        data: {
          id: runId,
          institutionId: session.membership.institutionId,
          campusId,
          storeId,
          menuPlanId,
          name: requiredText(body.name || menuPlan?.name || "Production run", "Production name"),
          preparedServings,
          servedServings,
          leftoverServings,
          note,
        },
        select: { id: true },
      });
      let totalCost = new Prisma.Decimal(0);
      let costKnown = true;
      for (const item of issues) {
        const consumption = await consumeStock(tx, {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          storeId,
          ingredientId: item.ingredientId,
          quantity: item.quantity,
          kind: "ISSUE",
          note: `Production run ${created.id}`,
        });
        if (consumption.totalCost === null) costKnown = false;
        else totalCost = totalCost.add(consumption.totalCost);
        const unitCost = consumption.totalCost
          ? consumption.totalCost.div(item.quantity).toDecimalPlaces(4).toFixed(4)
          : null;
        await tx.productionIssue.create({
          data: {
            institutionId: session.membership.institutionId,
            productionRunId: created.id,
            ingredientId: item.ingredientId,
            quantity: item.quantity,
            unitCost,
          },
        });
      }
      const cost = costKnown ? totalCost.toDecimalPlaces(4).toFixed(4) : null;
      await tx.productionRun.update({
        where: { id_institutionId: { id: created.id, institutionId: session.membership.institutionId } },
        data: { totalCost: cost },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: "production_run.create",
          entityType: "production_run",
          entityId: created.id,
        },
      });
      return tx.productionRun.findFirstOrThrow({
        where: { id: created.id, institutionId: session.membership.institutionId },
        select: {
          id: true,
          name: true,
          preparedServings: true,
          servedServings: true,
          leftoverServings: true,
          totalCost: true,
          createdAt: true,
          campus: { select: { id: true, name: true } },
          store: { select: { id: true, name: true } },
          menuPlan: { select: { id: true, name: true, serviceDate: true } },
          issues: {
            select: { id: true, quantity: true, unitCost: true, ingredient: { select: { id: true, name: true, unit: true } } },
          },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
