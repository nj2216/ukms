import { resolveSessionToken, parseCookie, SESSION_COOKIE } from "@/lib/auth";
import { campusScope } from "@/lib/domain";
import { HttpError } from "@/lib/http";

export async function requireMembership(request: Request) {
  const session = await resolveSessionToken(parseCookie(request, SESSION_COOKIE));
  if (!session) throw new HttpError(401, "Authentication is required.");
  if (session.user.mustChangePassword) {
    throw new HttpError(403, "Change your temporary password before continuing.");
  }
  return session;
}

export function requireRole(
  session: Awaited<ReturnType<typeof requireMembership>>,
  allowed: string[],
) {
  if (!allowed.includes(session.membership.role)) {
    throw new HttpError(403, "You do not have permission to perform this action.");
  }
}

export function scopedCampusId(
  session: Awaited<ReturnType<typeof requireMembership>>,
  requestedCampusId?: string | null,
) {
  const scope = campusScope(session.membership, requestedCampusId);
  if (scope.forbidden) {
    throw new HttpError(403, "You do not have access to that campus.");
  }
  return scope.campusId;
}
