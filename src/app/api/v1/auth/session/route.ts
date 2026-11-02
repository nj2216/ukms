import { NextResponse } from "next/server";
import { resolveSessionToken, parseCookie, SESSION_COOKIE } from "@/lib/auth";
import { jsonError } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const session = await resolveSessionToken(parseCookie(request, SESSION_COOKIE));
    if (!session) return NextResponse.json({ authenticated: false }, { status: 401 });
    return NextResponse.json({
      authenticated: true,
      user: { id: session.user.id, name: session.user.name, email: session.user.email },
      institution: session.membership.institution,
      campus: session.membership.campus,
      role: session.membership.role,
    });
  } catch (error) {
    return jsonError(error);
  }
}
