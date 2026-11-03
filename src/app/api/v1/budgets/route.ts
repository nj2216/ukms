import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireMembership, requireRole, scopedCampusId } from "@/lib/authorization";
import { assertSameOrigin, HttpError, jsonError, readJson, requiredText } from "@/lib/http";
import { prisma } from "@/lib/db";

function dateOnly(value: unknown, label: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, `${label} must be a valid calendar date.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, `${label} must be a valid calendar date.`);
  }
  return date;
}

export async function GET(request: Request) {
  try {
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "FINANCE_OFFICER", "AUDITOR"]);
    const campusId = scopedCampusId(session, new URL(request.url).searchParams.get("campusId"));
    const institutionId = session.membership.institutionId;
    const budgets = await prisma.financialBudget.findMany({
      where: { institutionId, ...(campusId ? { OR: [{ campusId }, { campusId: null }] } : {}) },
      include: { campus: { select: { id: true, name: true } } },
      orderBy: [{ periodStart: "desc" }, { name: "asc" }],
      take: 200,
    });
    const results = await Promise.all(budgets.map(async (budget) => {
      const periodEndExclusive = new Date(budget.periodEnd.getTime() + 24 * 60 * 60 * 1000);
      const spent = await prisma.supplierInvoice.aggregate({
        where: {
          institutionId,
          status: "RECONCILED",
          invoiceDate: { gte: budget.periodStart, lt: periodEndExclusive },
          purchaseOrder: {
            ...(budget.campusId ? { campusId: budget.campusId } : {}),
            ...(campusId ? { campusId } : {}),
          },
        },
        _sum: { amount: true },
      });
      const actual = new Prisma.Decimal(spent._sum.amount?.toString() ?? "0");
      const amount = new Prisma.Decimal(budget.amount.toString());
      const remaining = amount.sub(actual);
      return {
        id: budget.id,
        name: budget.name,
        campus: budget.campus,
        periodStart: budget.periodStart,
        periodEnd: budget.periodEnd,
        amount: amount.toFixed(2),
        spent: actual.toFixed(2),
        remaining: remaining.toFixed(2),
        utilizationPercent: amount.isZero() ? 0 : actual.div(amount).mul(100).toDecimalPlaces(1).toNumber(),
      };
    }));
    return NextResponse.json({ budgets: results });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "FINANCE_OFFICER"]);
    const body = await readJson(request);
    const name = requiredText(body.name, "Budget name");
    const campusId = scopedCampusId(session, typeof body.campusId === "string" ? body.campusId : null);
    const periodStart = dateOnly(body.periodStart, "Budget start");
    const periodEnd = dateOnly(body.periodEnd, "Budget end");
    if (periodEnd < periodStart) throw new HttpError(400, "Budget end must be on or after its start.");
    const amount = String(body.amount ?? "");
    if (!/^(0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(amount)) {
      throw new HttpError(400, "Budget amount must be non-negative with up to 2 decimal places.");
    }
    if (session.membership.role !== "INSTITUTION_ADMIN" && !campusId) {
      throw new HttpError(400, "Campus-scoped managers must assign the budget to their campus.");
    }
    const budget = await prisma.$transaction(async (tx) => {
      const created = await tx.financialBudget.create({
        data: {
          institutionId: session.membership.institutionId,
          campusId,
          name,
          periodStart,
          periodEnd,
          amount,
        },
        select: { id: true, name: true, campusId: true, periodStart: true, periodEnd: true, amount: true },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: "financial_budget.create",
          entityType: "financial_budget",
          entityId: created.id,
        },
      });
      return created;
    });
    return NextResponse.json({ budget }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
