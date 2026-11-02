import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "ukms_session";

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function applySessionCookie(
  response: Response,
  token: string,
  expiresAt: Date,
) {
  const headers = new Headers(response.headers);
  headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Expires=${expiresAt.toUTCString()}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function resolveSessionToken(token?: string) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: true,
      membership: {
        include: {
          institution: { select: { id: true, name: true, slug: true, currency: true } },
          campus: { select: { id: true, name: true, code: true } },
        },
      },
    },
  });
  if (!session) return null;
  if (!session.user.active || session.expiresAt <= new Date()) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  return session;
}

export async function currentSession() {
  const cookieJar = await cookies();
  return resolveSessionToken(cookieJar.get(SESSION_COOKIE)?.value);
}

export function parseCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const pair = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return pair ? pair.slice(name.length + 1) : undefined;
}

export async function deleteSession(token?: string) {
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }
}

export function clearSessionCookie(response: Response) {
  const headers = new Headers(response.headers);
  headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
