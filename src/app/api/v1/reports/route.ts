import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireMembership, requireRole, scopedCampusId } from "@/lib/authorization";
import { HttpError, jsonError } from "@/lib/http";
import { prisma } from "@/lib/db";

function parseDate(value: string | null, label: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, `${label} must use YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, `${label} must be a valid calendar date.`);
  }
  return date;
}

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  try {
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "PROCUREMENT_OFFICER", "FINANCE_OFFICER", "AUDITOR"]);
    const url = new URL(request.url);
    const campusId = scopedCampusId(session, url.searchParams.get("campusId"));
    const today = new Date();
    const defaultStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 29));
    const start = parseDate(url.searchParams.get("from"), "Start date") ?? defaultStart;
    const end = parseDate(url.searchParams.get("to"), "End date") ?? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    if (end < start) throw new HttpError(400, "End date must be on or after start date.");
    const endExclusive = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    const institutionId = session.membership.institutionId;
    const campusFilter = campusId ? { campusId } : {};

    const [runs, waste, invoices, inventoryValuation, campuses] = await Promise.all([
      prisma.productionRun.aggregate({
        where: { institutionId, ...campusFilter, createdAt: { gte: start, lt: endExclusive } },
        _count: { id: true },
        _sum: { preparedServings: true, servedServings: true, leftoverServings: true, totalCost: true },
      }),
      prisma.wasteRecord.groupBy({
        by: ["category"],
        where: { institutionId, ...campusFilter, createdAt: { gte: start, lt: endExclusive } },
        _sum: { quantity: true, estimatedCost: true },
        _count: { id: true },
      }),
      prisma.supplierInvoice.aggregate({
        where: {
          institutionId,
          status: "RECONCILED",
          invoiceDate: { gte: start, lt: endExclusive },
          purchaseOrder: campusId ? { campusId } : {},
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.$queryRaw<Array<{ knownValue: string; unknownCostQuantity: string }>>`
        SELECT
          CAST(COALESCE(SUM(CASE WHEN batch.unitCost IS NOT NULL THEN batch.remainingQuantity * batch.unitCost ELSE 0 END), 0) AS CHAR) AS knownValue,
          CAST(COALESCE(SUM(CASE WHEN batch.unitCost IS NULL THEN batch.remainingQuantity ELSE 0 END), 0) AS CHAR) AS unknownCostQuantity
        FROM StockBatch AS batch
        INNER JOIN Store AS store
          ON store.id = batch.storeId
          AND store.institutionId = batch.institutionId
        WHERE batch.institutionId = ${institutionId}
          AND batch.remainingQuantity > 0
          ${campusId ? Prisma.sql`AND store.campusId = ${campusId}` : Prisma.empty}
      `,
      prisma.campus.findMany({
        where: { institutionId, ...(campusId ? { id: campusId } : {}) },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const campusRows = await Promise.all(campuses.map(async (campus) => {
      const [campusRuns, campusWaste, campusSpend] = await Promise.all([
        prisma.productionRun.aggregate({
          where: { institutionId, campusId: campus.id, createdAt: { gte: start, lt: endExclusive } },
          _count: { id: true },
          _sum: { preparedServings: true, servedServings: true, leftoverServings: true },
        }),
        prisma.wasteRecord.aggregate({
          where: { institutionId, campusId: campus.id, createdAt: { gte: start, lt: endExclusive } },
          _sum: { estimatedCost: true },
        }),
        prisma.supplierInvoice.aggregate({
          where: {
            institutionId, status: "RECONCILED",
            invoiceDate: { gte: start, lt: endExclusive },
            purchaseOrder: { campusId: campus.id },
          },
          _sum: { amount: true },
        }),
      ]);
      return {
        id: campus.id,
        name: campus.name,
        runs: campusRuns._count.id,
        preparedServings: campusRuns._sum.preparedServings ?? 0,
        servedServings: campusRuns._sum.servedServings ?? 0,
        leftoverServings: campusRuns._sum.leftoverServings ?? 0,
        wasteCost: campusWaste._sum.estimatedCost?.toFixed(2) ?? null,
        reconciledPurchaseSpend: campusSpend._sum.amount?.toFixed(2) ?? "0.00",
      };
    }));

    const knownInventoryValue = new Prisma.Decimal(inventoryValuation[0]?.knownValue ?? "0");
    const unknownCostQuantity = new Prisma.Decimal(inventoryValuation[0]?.unknownCostQuantity ?? "0");

    const summary = {
      period: { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) },
      production: {
        runs: runs._count.id,
        preparedServings: runs._sum.preparedServings ?? 0,
        servedServings: runs._sum.servedServings ?? 0,
        leftoverServings: runs._sum.leftoverServings ?? 0,
        knownIngredientCost: runs._sum.totalCost?.toFixed(2) ?? null,
      },
      waste: waste.map((item) => ({
        category: item.category,
        records: item._count.id,
        quantity: item._sum.quantity?.toString() ?? "0",
        estimatedCost: item._sum.estimatedCost?.toFixed(2) ?? null,
      })),
      procurement: {
        reconciledInvoices: invoices._count.id,
        reconciledSpend: invoices._sum.amount?.toFixed(2) ?? "0.00",
      },
      inventoryValuation: {
        knownCost: knownInventoryValue.toDecimalPlaces(2).toFixed(2),
        quantityWithoutCost: unknownCostQuantity.toString(),
      },
      campuses: campusRows,
    };

    if (url.searchParams.get("format") === "csv") {
      const lines = [
        ["campus", "production_runs", "prepared_servings", "served_servings", "leftover_servings", "waste_cost", "reconciled_purchase_spend"].map(csvCell).join(","),
        ...campusRows.map((row) => [
          row.name, row.runs, row.preparedServings, row.servedServings, row.leftoverServings,
          row.wasteCost ?? "", row.reconciledPurchaseSpend,
        ].map(csvCell).join(",")),
      ];
      return new Response(lines.join("\r\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="kitchen-operations-${start.toISOString().slice(0, 10)}-${end.toISOString().slice(0, 10)}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json(summary);
  } catch (error) {
    return jsonError(error);
  }
}
