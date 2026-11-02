import { NextResponse } from "next/server";
import {
  applySessionCookie,
  hashSessionToken,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeEmail, slugify } from "@/lib/domain";
import { assertSameOrigin, HttpError, jsonError, readJson, requiredText } from "@/lib/http";
import { hashPassword } from "@/lib/password";
import { randomBytes, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJson(request);
    const expectedToken = process.env.BOOTSTRAP_TOKEN;
    const providedToken = request.headers.get("x-bootstrap-token") ?? "";
    if (!expectedToken) {
      throw new HttpError(503, "Configure BOOTSTRAP_TOKEN before initial setup.");
    }
    const expectedBytes = Buffer.from(expectedToken);
    const providedBytes = Buffer.from(providedToken);
    if (
      expectedBytes.length < 32 ||
      expectedBytes.length !== providedBytes.length ||
      !timingSafeEqual(expectedBytes, providedBytes)
    ) {
      throw new HttpError(401, "A valid setup token is required.");
    }
    const institutionName = requiredText(body.institutionName, "Institution name");
    const campusName = requiredText(body.campusName, "Campus name");
    const campusCode = requiredText(body.campusCode, "Campus code", 1, 64).toUpperCase();
    const name = requiredText(body.name, "Name");
    const email = normalizeEmail(requiredText(body.email, "Email", 3, 191));
    const password = body.password;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
    if (typeof password !== "string" || password.length < 12 || password.length > 128) {
      throw new HttpError(400, "Password must be 12-128 characters.");
    }

    const slug = slugify(institutionName);
    if (!slug) throw new HttpError(400, "Institution name must contain letters or numbers.");
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      if (await tx.bootstrapState.findUnique({ where: { key: "complete" } })) {
        throw new HttpError(409, "Initial setup has already been completed.");
      }

      const institution = await tx.institution.create({
        data: { name: institutionName, slug },
      });
      const campus = await tx.campus.create({
        data: {
          institutionId: institution.id,
          name: campusName,
          code: campusCode,
        },
      });
      const user = await tx.user.create({
        data: { email, name, passwordHash: await hashPassword(password) },
      });
      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          institutionId: institution.id,
          role: "INSTITUTION_ADMIN",
        },
      });
      await tx.store.create({
        data: {
          institutionId: institution.id,
          campusId: campus.id,
          name: "Main store",
          type: "CENTRAL",
        },
      });
      await tx.bootstrapState.create({ data: { key: "complete" } });
      await tx.session.create({
        data: {
          tokenHash: hashSessionToken(token),
          userId: user.id,
          membershipId: membership.id,
          expiresAt,
        },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: institution.id,
          actorId: user.id,
          action: "institution.bootstrap",
          entityType: "institution",
          entityId: institution.id,
        },
      });
      return { institution, campus, user };
    });

    const response = NextResponse.json(
      {
        user: { id: result.user.id, name: result.user.name, email: result.user.email },
        institution: { id: result.institution.id, name: result.institution.name },
        campus: { id: result.campus.id, name: result.campus.name },
      },
      { status: 201 },
    );
    return applySessionCookie(response, token, expiresAt);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Initial setup could not be completed. Check the institution and account details." },
        { status: 409 },
      );
    }
    return jsonError(error);
  }
}
