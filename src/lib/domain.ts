export type StockKind = "RECEIPT" | "ISSUE" | "WASTE" | "ADJUSTMENT";

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function toMilliUnits(value: string): bigint | null {
  const match = /^(0|[1-9]\d{0,8})(?:\.(\d{1,3}))?$/.exec(value);
  if (!match) return null;
  const fraction = (match[2] ?? "").padEnd(3, "0");
  return BigInt(match[1]) * 1000n + BigInt(fraction || "0");
}

export function movementQuantity(kind: StockKind, value: string): string | null {
  const isNegative = value.startsWith("-");
  const magnitude = isNegative ? value.slice(1) : value;
  const amount = toMilliUnits(magnitude);
  if (amount === null || amount === 0n || (kind !== "ADJUSTMENT" && isNegative)) return null;
  if (kind === "ADJUSTMENT") return value;
  return kind === "RECEIPT" ? value : `-${value}`;
}

export function campusScope(
  membership: { role: string; campusId: string | null },
  requestedCampusId?: string | null,
): { campusId?: string; forbidden: boolean } {
  if (membership.role === "INSTITUTION_ADMIN") {
    return { campusId: requestedCampusId || undefined, forbidden: false };
  }
  if (!membership.campusId) return { forbidden: true };
  if (requestedCampusId && requestedCampusId !== membership.campusId) {
    return { forbidden: true };
  }
  return { campusId: membership.campusId, forbidden: false };
}
