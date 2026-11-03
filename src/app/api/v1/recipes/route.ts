import { NextResponse } from "next/server";
import { requireMembership, requireRole } from "@/lib/authorization";
import { assertSameOrigin, jsonError, readJson, requiredText } from "@/lib/http";
import { prisma } from "@/lib/db";
import { createRecipeVersion, parseRecipeDraft } from "@/lib/recipes";

export async function GET(request: Request) {
  try {
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "KITCHEN_STAFF"]);
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim().slice(0, 100);
    const recipes = await prisma.recipe.findMany({
      where: {
        institutionId: session.membership.institutionId,
        active: true,
        ...(search ? { name: { contains: search } } : {}),
      },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        versions: {
          orderBy: { versionNumber: "desc" },
          select: {
            id: true,
            versionNumber: true,
            servingYield: true,
            createdAt: true,
            ingredients: {
              select: {
                quantity: true,
                ingredient: { select: { id: true, name: true, unit: true } },
              },
              orderBy: { ingredient: { name: "asc" } },
            },
          },
        },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 100,
    });
    return NextResponse.json({ recipes });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER"]);
    const body = await readJson(request);
    const name = requiredText(body.name, "Recipe name");
    const description = body.description === undefined || body.description === ""
      ? null
      : requiredText(body.description, "Description", 1, 500);
    const draft = parseRecipeDraft(body);
    const recipe = await prisma.$transaction(async (tx) => {
      const created = await tx.recipe.create({
        data: {
          institutionId: session.membership.institutionId,
          name,
          description,
        },
      });
      await createRecipeVersion(tx, session.membership.institutionId, created.id, 1, draft);
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: "recipe.create",
          entityType: "recipe",
          entityId: created.id,
        },
      });
      return tx.recipe.findFirstOrThrow({
        where: { id: created.id, institutionId: session.membership.institutionId },
        select: {
          id: true,
          name: true,
          description: true,
          versions: {
            select: {
              id: true,
              versionNumber: true,
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
      });
    });
    return NextResponse.json({ recipe }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "A recipe with this name already exists." }, { status: 409 });
    }
    return jsonError(error);
  }
}
