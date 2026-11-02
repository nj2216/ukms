import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { hashSessionToken, parseCookie, SESSION_COOKIE } from "@/lib/auth";
import { assertSameOrigin, HttpError, jsonError, readJson } from "@/lib/http";
import { hashPassword, verifyPassword } from "@/lib/password";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const token = parseCookie(request, SESSION_COOKIE);
    if (!token) throw new HttpError(401, "Authentication is required.");
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: true, membership: { select: { institutionId: true } } },
    });
    if (!session || session.expiresAt <= new Date() || !session.user.active) {
      throw new HttpError(401, "Authentication is required.");
    }

    const body = await readJson(request);
    const currentPassword = body.currentPassword;
    const newPassword = body.newPassword;
    if (typeof currentPassword !== "string" || currentPassword.length > 128) {
      throw new HttpError(400, "Current password is required.");
    }
    if (typeof newPassword !== "string" || newPassword.length < 12 || newPassword.length > 128) {
      throw new HttpError(400, "New password must be 12-128 characters.");
    }
    if (currentPassword === newPassword) {
      throw new HttpError(400, "Choose a password different from your current password.");
    }

    await prisma.$transaction(async (tx) => {
      const users = await tx.$queryRaw<Array<{ passwordHash: string; active: boolean }>>`
        SELECT passwordHash, active
        FROM User
        WHERE id = ${session.userId}
        FOR UPDATE
      `;
      const user = users[0];
      if (!user || !user.active || !(await verifyPassword(currentPassword, user.passwordHash))) {
        throw new HttpError(401, "Current password is incorrect.");
      }
      const currentSession = await tx.session.findFirst({
        where: {
          id: session.id,
          userId: session.userId,
          membershipId: session.membershipId,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (!currentSession) throw new HttpError(401, "Authentication is required.");
      const membership = await tx.membership.findUnique({
        where: { id: session.membershipId },
        select: { institutionId: true },
      });
      if (!membership) throw new HttpError(401, "Authentication is required.");

      await tx.user.update({
        where: { id: session.userId },
        data: {
          passwordHash: await hashPassword(newPassword),
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      await tx.session.deleteMany({
        where: { userId: session.userId, id: { not: session.id } },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: membership.institutionId,
          actorId: session.userId,
          action: "auth.password_change",
          entityType: "user",
          entityId: session.userId,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ changed: true });
  } catch (error) {
    return jsonError(error);
  }
}
