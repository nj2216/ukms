import { NextResponse } from "next/server";
import { requireMembership, requireRole, scopedCampusId } from "@/lib/authorization";
import { assertSameOrigin, HttpError, jsonError, readJson, requiredText } from "@/lib/http";
import { prisma } from "@/lib/db";

const mealTypes = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const;

function parseServiceDate(value: unknown): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, "Service date must be a valid calendar date.");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, "Service date must be a valid calendar date.");
  }
  return date;
}

export async function GET(request: Request) {
  try {
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "KITCHEN_STAFF"]);
    const url = new URL(request.url);
    const campusId = scopedCampusId(session, url.searchParams.get("campusId"));
    const menuPlans = await prisma.menuPlan.findMany({
      where: {
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
            id: true,
            plannedServings: true,
            recipeVersion: {
              select: {
                id: true,
                versionNumber: true,
                servingYield: true,
                recipe: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: [{ serviceDate: "desc" }, { id: "desc" }],
      take: 100,
    });
    return NextResponse.json({ menuPlans });
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
    const campusId = scopedCampusId(
      session,
      typeof body.campusId === "string" ? body.campusId : null,
    );
    if (!campusId) throw new HttpError(400, "A campus is required for a meal plan.");
    const name = requiredText(body.name, "Menu name");
    const serviceDate = parseServiceDate(body.serviceDate);
    if (typeof body.mealType !== "string" || !mealTypes.includes(body.mealType as (typeof mealTypes)[number])) {
      throw new HttpError(400, "Choose a valid meal type.");
    }
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) {
      throw new HttpError(400, "Add between 1 and 30 recipes to the meal plan.");
    }
    const items = body.items.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new HttpError(400, "Each menu item must include a recipe version and serving count.");
      }
      const entry = item as Record<string, unknown>;
      const recipeVersionId = requiredText(entry.recipeVersionId, "Recipe version");
      const plannedServings = Number(entry.plannedServings);
      if (!Number.isSafeInteger(plannedServings) || plannedServings < 1 || plannedServings > 1000000) {
        throw new HttpError(400, "Planned servings must be a whole number between 1 and 1,000,000.");
      }
      return { recipeVersionId, plannedServings };
    });
    if (new Set(items.map(({ recipeVersionId }) => recipeVersionId)).size !== items.length) {
      throw new HttpError(400, "A recipe version can only appear once in a meal plan.");
    }
    const versions = await prisma.recipeVersion.findMany({
      where: {
        institutionId: session.membership.institutionId,
        id: { in: items.map(({ recipeVersionId }) => recipeVersionId) },
        recipe: { active: true },
      },
      select: { id: true },
    });
    if (versions.length !== items.length) {
      throw new HttpError(400, "One or more selected recipes are unavailable.");
    }
    const campus = await prisma.campus.findFirst({
      where: { id: campusId, institutionId: session.membership.institutionId },
      select: { id: true },
    });
    if (!campus) throw new HttpError(404, "Campus not found.");

    const menuPlan = await prisma.$transaction(async (tx) => {
      const created = await tx.menuPlan.create({
        data: {
          institutionId: session.membership.institutionId,
          campusId: campus.id,
          name,
          mealType: body.mealType as (typeof mealTypes)[number],
          serviceDate,
          items: {
            create: items.map((item) => ({
              plannedServings: item.plannedServings,
              recipeVersion: {
                connect: {
                  id_institutionId: {
                    id: item.recipeVersionId,
                    institutionId: session.membership.institutionId,
                  },
                },
              },
            })),
          },
        },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: "menu_plan.create",
          entityType: "menu_plan",
          entityId: created.id,
        },
      });
      return tx.menuPlan.findFirstOrThrow({
        where: { id: created.id, institutionId: session.membership.institutionId },
        select: {
          id: true,
          name: true,
          mealType: true,
          serviceDate: true,
          status: true,
          campus: { select: { id: true, name: true } },
          items: {
            select: {
              id: true,
              plannedServings: true,
              recipeVersion: {
                select: {
                  id: true,
                  versionNumber: true,
                  servingYield: true,
                  recipe: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      });
    });
    return NextResponse.json({ menuPlan }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
