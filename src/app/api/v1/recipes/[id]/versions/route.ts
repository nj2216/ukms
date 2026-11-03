import { NextResponse } from "next/server";
import { requireMembership, requireRole } from "@/lib/authorization";
import { assertSameOrigin, HttpError, jsonError, readJson } from "@/lib/http";
import { prisma } from "@/lib/db";
import { createRecipeVersion, parseRecipeDraft } from "@/lib/recipes";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER"]);
    const { id } = await context.params;
    const draft = parseRecipeDraft(await readJson(request));
    const version = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM Recipe
        WHERE id = ${id} AND institutionId = ${session.membership.institutionId} AND active = true
        FOR UPDATE
      `;
      if (!locked.length) throw new HttpError(404, "Recipe not found.");
      const latest = await tx.recipeVersion.findFirst({
        where: { recipeId: id, institutionId: session.membership.institutionId },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      });
      const created = await createRecipeVersion(
        tx,
        session.membership.institutionId,
        id,
        (latest?.versionNumber ?? 0) + 1,
        draft,
      );
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: "recipe.version.create",
          entityType: "recipe_version",
          entityId: created.id,
        },
      });
      return tx.recipeVersion.findFirstOrThrow({
        where: { id: created.id, institutionId: session.membership.institutionId },
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
      });
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
