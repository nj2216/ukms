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
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  if (code === "P2002" || code === "P2003") {
    return NextResponse.json({ error: "The request conflicts with existing data." }, { status: 409 });
  }
  if (code === "P2034") {
    return NextResponse.json(
      { error: "The record changed concurrently. Refresh and retry." },
      { status: 409 },
    );
  }
  console.error("Request failed", error);
  return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json.");
  }
  if (Number(request.headers.get("content-length") ?? 0) > 16_384) {
    throw new HttpError(413, "Request body is too large.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Request body must be valid JSON.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 16_384) {
        await reader.cancel();
        throw new HttpError(413, "Request body is too large.");
      }
      chunks.push(value);
    }
    const body: unknown = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
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
