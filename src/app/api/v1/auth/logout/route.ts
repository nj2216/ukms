import { NextResponse } from "next/server";
import { clearSessionCookie, deleteSession, parseCookie, SESSION_COOKIE } from "@/lib/auth";
import { assertSameOrigin, jsonError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await deleteSession(parseCookie(request, SESSION_COOKIE));
    return clearSessionCookie(NextResponse.json({ ok: true }));
  } catch (error) {
    return jsonError(error);
  }
}
