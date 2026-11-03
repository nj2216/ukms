import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireMembership, requireRole, scopedCampusId } from "@/lib/authorization";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "PROCUREMENT_OFFICER", "FINANCE_OFFICER", "AUDITOR"]);
    const campusId = scopedCampusId(session, new URL(request.url).searchParams.get("campusId"));
    const orders = await prisma.purchaseOrder.findMany({
      where: {
        institutionId: session.membership.institutionId,
        ...(campusId ? { campusId } : {}),
      },
      select: {
        id: true,
        createdAt: true,
        supplier: { select: { id: true, name: true } },
        items: { select: { orderedQuantity: true, receivedQuantity: true } },
        invoices: { where: { status: "RECONCILED" }, select: { amount: true, invoiceDate: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 2000,
    });
    const summary = new Map<string, {
      supplier: { id: string; name: string };
      orders: number;
      reconciledInvoices: number;
      spend: Prisma.Decimal;
      orderedQuantity: Prisma.Decimal;
      receivedQuantity: Prisma.Decimal;
      lastOrderAt: Date;
    }>();
    for (const order of orders) {
      let row = summary.get(order.supplier.id);
      if (!row) {
        row = {
          supplier: order.supplier,
          orders: 0,
          reconciledInvoices: 0,
          spend: new Prisma.Decimal(0),
          orderedQuantity: new Prisma.Decimal(0),
          receivedQuantity: new Prisma.Decimal(0),
          lastOrderAt: order.createdAt,
        };
        summary.set(order.supplier.id, row);
      }
      row.orders += 1;
      for (const item of order.items) {
        row.orderedQuantity = row.orderedQuantity.add(item.orderedQuantity.toString());
        row.receivedQuantity = row.receivedQuantity.add(item.receivedQuantity.toString());
      }
      for (const invoice of order.invoices) {
        row.reconciledInvoices += 1;
        row.spend = row.spend.add(invoice.amount.toString());
      }
    }
    const suppliers = [...summary.values()]
      .sort((a, b) => a.supplier.name.localeCompare(b.supplier.name))
      .map((row) => ({
        supplier: row.supplier,
        orders: row.orders,
        reconciledInvoices: row.reconciledInvoices,
        reconciledSpend: row.spend.toFixed(2),
        orderedQuantity: row.orderedQuantity.toFixed(3),
        receivedQuantity: row.receivedQuantity.toFixed(3),
        fulfillmentPercent: row.orderedQuantity.isZero()
          ? null
          : row.receivedQuantity.div(row.orderedQuantity).mul(100).toDecimalPlaces(1).toNumber(),
        lastOrderAt: row.lastOrderAt,
      }));
    return NextResponse.json({ suppliers });
  } catch (error) {
    return jsonError(error);
  }
}
