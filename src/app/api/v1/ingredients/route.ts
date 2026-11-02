import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMembership, requireRole } from "@/lib/authorization";
import { assertSameOrigin, HttpError, jsonError, readJson, requiredText } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const session = await requireMembership(request);
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") || undefined;
    const search = url.searchParams.get("search")?.trim().slice(0, 100);
    const ingredients = await prisma.ingredient.findMany({
      where: {
        institutionId: session.membership.institutionId,
        active: true,
        ...(search ? { name: { contains: search } } : {}),
      },
      select: {
        id: true,
        name: true,
        unit: true,
        reorderLevel: true,
      },
      orderBy: { name: "asc" },
      take: 100,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    return NextResponse.json({
      ingredients,
      nextCursor: ingredients.length === 100 ? ingredients.at(-1)?.id : null,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN"]);
    const body = await readJson(request);
    const name = requiredText(body.name, "Ingredient name");
    const unit = requiredText(body.unit, "Unit", 1, 32);
    const reorderLevel =
      body.reorderLevel === undefined || body.reorderLevel === "" ? "0" : String(body.reorderLevel);
    if (!/^(0|[1-9]\d{0,8})(?:\.\d{1,3})?$/.test(reorderLevel)) {
      throw new HttpError(400, "Reorder level must be a non-negative quantity with up to 3 decimal places.");
    }
    const ingredient = await prisma.$transaction(async (tx) => {
      const created = await tx.ingredient.create({
        data: {
          institutionId: session.membership.institutionId,
          name,
          unit,
          reorderLevel,
        },
        select: { id: true, name: true, unit: true, reorderLevel: true },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: "ingredient.create",
          entityType: "ingredient",
          entityId: created.id,
        },
      });
      return created;
    });
    return NextResponse.json({ ingredient }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
