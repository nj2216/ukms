import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";

export async function GET() {
  try {
    const initialized = Boolean(await prisma.bootstrapState.findUnique({ where: { key: "complete" } }));
    return NextResponse.json({ initialized });
  } catch (error) {
    return jsonError(error);
  }
}
