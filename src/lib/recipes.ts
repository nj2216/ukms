import { Prisma } from "@/generated/prisma/client";
import { HttpError, requiredText } from "@/lib/http";
import { toMilliUnits } from "@/lib/domain";

export type RecipeDraft = {
  servingYield: number;
  ingredients: Array<{ ingredientId: string; quantity: string }>;
};

export function parseRecipeDraft(body: Record<string, unknown>): RecipeDraft {
  const servingYield = Number(body.servingYield);
  if (!Number.isSafeInteger(servingYield) || servingYield < 1 || servingYield > 1000000) {
    throw new HttpError(400, "Serving yield must be a whole number between 1 and 1,000,000.");
  }
  if (!Array.isArray(body.ingredients) || body.ingredients.length < 1 || body.ingredients.length > 100) {
    throw new HttpError(400, "Add between 1 and 100 recipe ingredients.");
  }
  const ingredients = body.ingredients.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new HttpError(400, "Each recipe ingredient must include an ingredient and quantity.");
    }
    const entry = item as Record<string, unknown>;
    const ingredientId = requiredText(entry.ingredientId, "Ingredient");
    const quantity = String(entry.quantity ?? "");
    const milliUnits = toMilliUnits(quantity);
    if (milliUnits === null || milliUnits <= 0n) {
      throw new HttpError(400, "Recipe ingredient quantities must be positive with up to 3 decimal places.");
    }
    return { ingredientId, quantity };
  });
  if (new Set(ingredients.map(({ ingredientId }) => ingredientId)).size !== ingredients.length) {
    throw new HttpError(400, "Each ingredient can appear only once in a recipe version.");
  }
  return { servingYield, ingredients };
}

export async function assertRecipeIngredients(
  tx: Prisma.TransactionClient,
  institutionId: string,
  ingredients: RecipeDraft["ingredients"],
) {
  const found = await tx.ingredient.findMany({
    where: {
      institutionId,
      active: true,
      id: { in: ingredients.map(({ ingredientId }) => ingredientId) },
    },
    select: { id: true },
  });
  if (found.length !== ingredients.length) {
    throw new HttpError(400, "One or more selected ingredients are unavailable in this institution.");
  }
}

export async function createRecipeVersion(
  tx: Prisma.TransactionClient,
  institutionId: string,
  recipeId: string,
  versionNumber: number,
  draft: RecipeDraft,
) {
  await assertRecipeIngredients(tx, institutionId, draft.ingredients);
  const version = await tx.recipeVersion.create({
    data: {
      institutionId,
      recipeId,
      versionNumber,
      servingYield: draft.servingYield,
    },
  });
  await tx.recipeIngredient.createMany({
    data: draft.ingredients.map((item) => ({
      institutionId,
      recipeVersionId: version.id,
      ingredientId: item.ingredientId,
      quantity: item.quantity,
    })),
  });
  return version;
}
