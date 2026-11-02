import { NextResponse } from "next/server";
import { applySessionCookie, createSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/domain";
import { assertSameOrigin, HttpError, jsonError, readJson, requiredText } from "@/lib/http";
import { verifyPassword } from "@/lib/password";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJson(request);
    const institutionSlug = requiredText(body.institutionSlug, "Institution slug", 1, 191).toLowerCase();
    const email = normalizeEmail(requiredText(body.email, "Email", 3, 191));
    const password = body.password;
    if (typeof password !== "string" || password.length > 128) {
      throw new HttpError(401, "Email, password, or institution is incorrect.");
    }

    const membership = await prisma.membership.findFirst({
      where: {
        institution: { slug: institutionSlug },
        user: { email, active: true },
      },
      include: {
        user: true,
        institution: { select: { id: true, name: true, slug: true } },
        campus: { select: { id: true, name: true } },
      },
    });
    const user = membership?.user;
    const validPassword = verifyPassword(password, user?.passwordHash);
    if (
      !membership ||
      !user ||
      (user.lockedUntil && user.lockedUntil > new Date()) ||
      !validPassword
    ) {
      if (user && (!user.lockedUntil || user.lockedUntil <= new Date())) {
        const failures = user.failedLoginAttempts + 1;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: failures,
            lockedUntil:
              failures >= 8 ? new Date(Date.now() + 15 * 60 * 1000) : null,
          },
        });
      }
      throw new HttpError(401, "Email, password, or institution is incorrect.");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
    const { token, expiresAt } = await createSession(user.id, membership.id);
    await prisma.auditEvent.create({
      data: {
        institutionId: membership.institutionId,
        actorId: user.id,
        action: "auth.login",
        entityType: "session",
        entityId: token.slice(0, 8),
      },
    });
    const response = NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email },
      institution: membership.institution,
      campus: membership.campus,
      role: membership.role,
    });
    return applySessionCookie(response, token, expiresAt);
  } catch (error) {
    return jsonError(error);
  }
}
