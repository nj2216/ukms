import { NextResponse } from "next/server";
import { requireMembership, scopedCampusId } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const session = await requireMembership(request);
    const url = new URL(request.url);
    const campusId = scopedCampusId(session, url.searchParams.get("campusId"));
    const cursor = url.searchParams.get("cursor") || undefined;
    const balances = await prisma.stockBalance.findMany({
      where: {
        institutionId: session.membership.institutionId,
        ...(campusId ? { store: { campusId } } : {}),
      },
      include: {
        store: { select: { id: true, name: true, campus: { select: { id: true, name: true } } } },
        ingredient: { select: { id: true, name: true, unit: true, reorderLevel: true } },
      },
      orderBy: { id: "asc" },
      take: 100,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    return NextResponse.json({
      balances: balances.map(({ id, onHand, store, ingredient }) => ({
        id,
        onHand,
        store,
        ingredient,
        belowReorderLevel: onHand.lessThan(ingredient.reorderLevel),
      })),
      nextCursor: balances.length === 100 ? balances.at(-1)?.id : null,
    });
  } catch (error) {
    return jsonError(error);
  }
}
