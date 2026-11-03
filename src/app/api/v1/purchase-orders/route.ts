import { NextResponse } from "next/server";
import { requireMembership, requireRole, scopedCampusId } from "@/lib/authorization";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const session = await requireMembership(request);
    requireRole(session, ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "STOREKEEPER", "PROCUREMENT_OFFICER", "FINANCE_OFFICER"]);
    const campusId = scopedCampusId(session, new URL(request.url).searchParams.get("campusId"));
    const orders = await prisma.purchaseOrder.findMany({
      where: {
        institutionId: session.membership.institutionId,
        ...(campusId ? { campusId } : {}),
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        campus: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        items: {
          select: {
            id: true,
            orderedQuantity: true,
            receivedQuantity: true,
            unitCost: true,
            ingredient: { select: { id: true, name: true, unit: true } },
          },
        },
        receipts: {
          select: {
            id: true,
            receivedAt: true,
            note: true,
            items: {
              select: {
                id: true,
                quantity: true,
                batchCode: true,
                expiryDate: true,
                purchaseOrderItem: {
                  select: { ingredient: { select: { name: true, unit: true } } },
                },
              },
            },
          },
          orderBy: { receivedAt: "desc" },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    return NextResponse.json({ orders });
  } catch (error) {
    return jsonError(error);
  }
}
