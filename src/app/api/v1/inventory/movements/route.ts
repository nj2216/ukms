import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireMembership, requireRole, scopedCampusId } from "@/lib/authorization";
import { assertSameOrigin, HttpError, jsonError, readJson, requiredText } from "@/lib/http";
import { movementQuantity, toMilliUnits, type StockKind } from "@/lib/domain";
import { prisma } from "@/lib/db";

const stockKinds: StockKind[] = ["RECEIPT", "ISSUE", "WASTE", "ADJUSTMENT"];

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "STOREKEEPER", "KITCHEN_STAFF"]);
    const body = await readJson(request);
    const storeId = requiredText(body.storeId, "Store");
    const ingredientId = requiredText(body.ingredientId, "Ingredient");
    const kind = body.kind;
    if (typeof kind !== "string" || !stockKinds.includes(kind as StockKind)) {
      throw new HttpError(400, "Choose a valid stock movement type.");
    }
    if (session.membership.role === "KITCHEN_STAFF" && kind !== "ISSUE") {
      throw new HttpError(403, "Kitchen staff can only issue stock.");
    }
    const campusId = typeof body.campusId === "string" ? body.campusId : null;
    const allowedCampus = scopedCampusId(session, campusId);
    const store = await prisma.store.findFirst({
      where: {
        id: storeId,
        institutionId: session.membership.institutionId,
        ...(allowedCampus ? { campusId: allowedCampus } : {}),
      },
      select: { id: true, campusId: true },
    });
    if (!store) throw new HttpError(404, "Store not found.");
    const ingredient = await prisma.ingredient.findFirst({
      where: { id: ingredientId, institutionId: session.membership.institutionId, active: true },
      select: { id: true },
    });
    if (!ingredient) throw new HttpError(404, "Ingredient not found.");

    const quantity = movementQuantity(kind as StockKind, String(body.quantity ?? ""));
    if (!quantity) {
      throw new HttpError(
        400,
        kind === "ADJUSTMENT"
          ? "Adjustment must be a non-zero signed quantity with up to 3 decimal places."
          : "Quantity must be a positive number with up to 3 decimal places.",
      );
    }
    const note = body.note === undefined ? null : requiredText(body.note, "Note", 1, 500);
    const signedMilliUnits =
      quantity.startsWith("-")
        ? -(toMilliUnits(quantity.slice(1)) ?? 0n)
        : (toMilliUnits(quantity) ?? 0n);
    const amount = quantity.startsWith("-") ? quantity.slice(1) : quantity;

    const movement = await prisma.$transaction(async (tx) => {
      const unique = {
        storeId_ingredientId: { storeId: store.id, ingredientId: ingredient.id },
      };
      if (signedMilliUnits < 0n) {
        const rows = await tx.$queryRaw<Array<{ onHand: string }>>`
          SELECT CAST(onHand AS CHAR) AS onHand
          FROM StockBalance
          WHERE institutionId = ${session.membership.institutionId}
            AND storeId = ${store.id}
            AND ingredientId = ${ingredient.id}
          FOR UPDATE
        `;
        const current = rows[0] ? toMilliUnits(String(rows[0].onHand)) : null;
        if (current === null || current < -signedMilliUnits) {
          throw new HttpError(409, "There is not enough stock for this movement.");
        }
        await tx.stockBalance.update({
          where: unique,
          data: { onHand: { decrement: amount } },
        });
      } else {
        await tx.stockBalance.upsert({
          where: unique,
          create: {
            institutionId: session.membership.institutionId,
            storeId: store.id,
            ingredientId: ingredient.id,
            onHand: amount,
          },
          update: { onHand: { increment: amount } },
        });
      }

      const created = await tx.stockMovement.create({
        data: {
          institutionId: session.membership.institutionId,
          storeId: store.id,
          ingredientId: ingredient.id,
          kind: kind as StockKind,
          quantity,
          note,
        },
        select: { id: true, kind: true, quantity: true, createdAt: true },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: `inventory.${kind.toLowerCase()}`,
          entityType: "stock_movement",
          entityId: created.id,
        },
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ movement }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
