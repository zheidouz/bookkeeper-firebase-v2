/**
 * Role enum + UI helpers.
 *
 * The set of roles is fixed in the PRD — three values, no others.
 * Unknown / unassigned users default to "staff" (see resolveRole).
 */

export type Role = "admin" | "bookkeeper" | "staff";

export const ROLES: readonly Role[] = ["admin", "bookkeeper", "staff"] as const;

export const DEFAULT_ROLE: Role = "staff";

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}