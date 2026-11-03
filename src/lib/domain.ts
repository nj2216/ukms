export type StockKind = "RECEIPT" | "ISSUE" | "WASTE" | "ADJUSTMENT";
export type MembershipRole =
  | "INSTITUTION_ADMIN"
  | "CAMPUS_MANAGER"
  | "KITCHEN_STAFF"
  | "STOREKEEPER"
  | "PROCUREMENT_OFFICER"
  | "FINANCE_OFFICER"
  | "AUDITOR";

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

export function allocateStockBatches(
  batches: Array<{ id: string; remainingQuantity: string }>,
  requestedQuantity: string,
): Array<{ batchId: string; quantity: string }> | null {
  const requested = toMilliUnits(requestedQuantity);
  if (requested === null || requested <= 0n) return null;

  let remaining = requested;
  const allocations: Array<{ batchId: string; quantity: string }> = [];
  for (const batch of batches) {
    const available = toMilliUnits(batch.remainingQuantity);
    if (available === null || available <= 0n) continue;
    const allocated = available < remaining ? available : remaining;
    allocations.push({ batchId: batch.id, quantity: formatMilliUnits(allocated) });
    remaining -= allocated;
    if (remaining === 0n) return allocations;
  }
  return null;
}

export function calculateDemandQuantity(
  quantityPerYield: string,
  servingYield: number,
  plannedServings: number,
): string | null {
  const quantity = toMilliUnits(quantityPerYield);
  if (
    quantity === null ||
    quantity <= 0n ||
    !Number.isSafeInteger(servingYield) ||
    servingYield <= 0 ||
    !Number.isSafeInteger(plannedServings) ||
    plannedServings <= 0
  ) return null;
  const denominator = BigInt(servingYield);
  const numerator = quantity * BigInt(plannedServings);
  return formatMilliUnits((numerator + denominator - 1n) / denominator);
}

export function formatMilliUnits(value: bigint): string {
  const whole = value / 1000n;
  const fraction = String(value % 1000n).padStart(3, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
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

export function membershipAccessChangeError(
  actorUserId: string,
  targetUserId: string,
  currentRole: MembershipRole,
  nextRole: MembershipRole,
  institutionAdminCount: number,
): string | null {
  if (actorUserId === targetUserId) {
    return "You cannot change your own membership.";
  }
  if (
    currentRole === "INSTITUTION_ADMIN" &&
    nextRole !== "INSTITUTION_ADMIN" &&
    institutionAdminCount <= 1
  ) {
    return "The institution must retain an administrator.";
  }
  return null;
}
