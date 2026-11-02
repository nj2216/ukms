import { NextResponse } from "next/server";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Request failed", error);
  return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json.");
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 16_384) throw new HttpError(413, "Request body is too large.");
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new HttpError(400, "A JSON object is required.");
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new HttpError(403, "Cross-origin requests are not allowed.");
  }
}

export function requiredText(
  value: unknown,
  field: string,
  minLength = 1,
  maxLength = 191,
): string {
  if (typeof value !== "string") throw new HttpError(400, `${field} is required.`);
  const text = value.trim();
  if (text.length < minLength || text.length > maxLength) {
    throw new HttpError(400, `${field} must be ${minLength}-${maxLength} characters.`);
  }
  return text;
}
