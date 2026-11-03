import { NextResponse } from "next/server";
import { requireMembership, scopedCampusId } from "@/lib/authorization";
import { HttpError, jsonError } from "@/lib/http";
import { prisma } from "@/lib/db";

const pageSize = 100;
const dayMilliseconds = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const session = await requireMembership(request);
    const url = new URL(request.url);
    const campusId = scopedCampusId(session, url.searchParams.get("campusId"));
    const cursor = url.searchParams.get("cursor") || undefined;
    if (cursor && cursor.length > 191) throw new HttpError(400, "Invalid batch cursor.");
    const daysParam = url.searchParams.get("days");
    const days = daysParam === null ? 30 : Number(daysParam);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      throw new HttpError(400, "Expiry window must be between 1 and 365 days.");
    }

    const today = new Date();
    const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const throughDate = new Date(todayStart.getTime() + days * dayMilliseconds);
    const scope = {
      institutionId: session.membership.institutionId,
      remainingQuantity: { gt: 0 },
      expiryDate: { lte: throughDate },
      ...(campusId ? { store: { campusId } } : {}),
    };
    const [batches, expiredCount, expiringCount] = await Promise.all([
      prisma.stockBatch.findMany({
        where: scope,
        select: {
          id: true,
          batchCode: true,
          expiryDate: true,
          remainingQuantity: true,
          receivedQuantity: true,
          store: { select: { name: true, campus: { select: { id: true, name: true } } } },
          ingredient: { select: { name: true, unit: true } },
        },
        orderBy: [{ expiryDate: "asc" }, { id: "asc" }],
        take: pageSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      }),
      prisma.stockBatch.count({
        where: { ...scope, expiryDate: { lt: todayStart } },
      }),
      prisma.stockBatch.count({
        where: {
          ...scope,
          expiryDate: { gte: todayStart, lte: throughDate },
        },
      }),
    ]);

    return NextResponse.json({
      batches: batches.map((batch) => {
        const expiryDate = batch.expiryDate!;
        const dateOnly = new Date(Date.UTC(expiryDate.getUTCFullYear(), expiryDate.getUTCMonth(), expiryDate.getUTCDate()));
        return {
          ...batch,
          daysUntilExpiry: Math.floor((dateOnly.getTime() - todayStart.getTime()) / dayMilliseconds),
        };
      }),
      expiredCount,
      expiringCount,
      nextCursor: batches.length === pageSize ? batches.at(-1)?.id : null,
    });
  } catch (error) {
    return jsonError(error);
  }
}
