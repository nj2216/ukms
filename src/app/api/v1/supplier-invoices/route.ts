import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireMembership, requireRole, scopedCampusId } from "@/lib/authorization";
import { assertSameOrigin, HttpError, jsonError, readJson, requiredText } from "@/lib/http";
import { prisma } from "@/lib/db";

function invoiceDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, "Invoice date must be a valid calendar date.");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, "Invoice date must be a valid calendar date.");
  }
  return date;
}

function money(value: unknown) {
  const amount = String(value ?? "");
  if (!/^(0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(amount)) {
    throw new HttpError(400, "Invoice amount must be non-negative with up to 2 decimal places.");
  }
  return amount;
}

export async function GET(request: Request) {
  try {
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "FINANCE_OFFICER", "AUDITOR"]);
    const campusId = scopedCampusId(session, new URL(request.url).searchParams.get("campusId"));
    const invoices = await prisma.supplierInvoice.findMany({
      where: {
        institutionId: session.membership.institutionId,
        ...(campusId ? { purchaseOrder: { campusId } } : {}),
      },
      select: {
        id: true,
        supplierInvoiceNumber: true,
        invoiceDate: true,
        amount: true,
        status: true,
        note: true,
        createdAt: true,
        reconciledAt: true,
        purchaseOrder: {
          select: {
            id: true,
            campus: { select: { id: true, name: true } },
            supplier: { select: { id: true, name: true } },
            items: { select: { receivedQuantity: true, unitCost: true } },
          },
        },
      },
      orderBy: [{ invoiceDate: "desc" }, { id: "desc" }],
      take: 200,
    });
    return NextResponse.json({ invoices });
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
    const purchaseOrderId = requiredText(body.purchaseOrderId, "Purchase order");
    const supplierInvoiceNumber = requiredText(body.supplierInvoiceNumber, "Invoice number", 1, 100);
    const date = invoiceDate(body.invoiceDate);
    const amount = money(body.amount);
    const note = body.note === undefined || body.note === "" ? null : requiredText(body.note, "Note", 1, 500);
    const campusId = scopedCampusId(session);
    const order = await prisma.purchaseOrder.findFirst({
      where: {
        id: purchaseOrderId,
        institutionId: session.membership.institutionId,
        ...(campusId ? { campusId } : {}),
      },
      select: {
        id: true,
        status: true,
        items: { select: { receivedQuantity: true, unitCost: true } },
      },
    });
    if (!order) throw new HttpError(404, "Purchase order not found.");
    if (order.status !== "RECEIVED" || !order.items.some((item) => Number(item.receivedQuantity) > 0)) {
      throw new HttpError(409, "Fully receive the purchase order before entering its invoice.");
    }
    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.supplierInvoice.create({
        data: {
          institutionId: session.membership.institutionId,
          purchaseOrderId: order.id,
          supplierInvoiceNumber,
          invoiceDate: date,
          amount,
          note,
        },
        select: { id: true, supplierInvoiceNumber: true, invoiceDate: true, amount: true, status: true },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: "supplier_invoice.create",
          entityType: "supplier_invoice",
          entityId: created.id,
        },
      });
      return created;
    });
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "FINANCE_OFFICER"]);
    const body = await readJson(request);
    const id = requiredText(body.id, "Invoice");
    if (body.action !== "reconcile" && body.action !== "reject") {
      throw new HttpError(400, "Choose reconcile or reject.");
    }
    const campusId = scopedCampusId(session);
    const invoice = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string; purchaseOrderId: string; amount: string }>>`
        SELECT invoice.id, invoice.status, invoice.purchaseOrderId, CAST(invoice.amount AS CHAR) AS amount
        FROM SupplierInvoice AS invoice
        INNER JOIN PurchaseOrder AS purchaseOrder
          ON purchaseOrder.id = invoice.purchaseOrderId
          AND purchaseOrder.institutionId = invoice.institutionId
        WHERE invoice.id = ${id}
          AND invoice.institutionId = ${session.membership.institutionId}
          ${campusId ? Prisma.sql`AND purchaseOrder.campusId = ${campusId}` : Prisma.empty}
        FOR UPDATE
      `;
      const current = rows[0];
      if (!current) throw new HttpError(404, "Invoice not found.");
      if (current.status !== "PENDING") throw new HttpError(409, "Only pending invoices can be reconciled or rejected.");
      if (body.action === "reconcile") {
        const order = await tx.purchaseOrder.findFirstOrThrow({
          where: { id: current.purchaseOrderId, institutionId: session.membership.institutionId },
          select: { items: { select: { receivedQuantity: true, unitCost: true } } },
        });
        let expected = new Prisma.Decimal(0);
        for (const item of order.items) {
          if (Number(item.receivedQuantity) > 0 && item.unitCost === null) {
            throw new HttpError(409, "An order item has no recorded unit cost and cannot be reconciled.");
          }
          expected = expected.add(new Prisma.Decimal(item.receivedQuantity.toString()).mul(item.unitCost ?? 0));
        }
        const invoiceAmount = new Prisma.Decimal(current.amount);
        if (!expected.toDecimalPlaces(2).equals(invoiceAmount)) {
          throw new HttpError(409, `Invoice total does not match received goods (expected ${expected.toFixed(2)}).`);
        }
      }
      const updated = await tx.supplierInvoice.update({
        where: { id_institutionId: { id, institutionId: session.membership.institutionId } },
        data: {
          status: body.action === "reconcile" ? "RECONCILED" : "REJECTED",
          ...(body.action === "reconcile" ? { reconciledAt: new Date() } : {}),
        },
        select: { id: true, status: true, reconciledAt: true },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: `supplier_invoice.${body.action}`,
          entityType: "supplier_invoice",
          entityId: id,
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ invoice });
  } catch (error) {
    return jsonError(error);
  }
}
