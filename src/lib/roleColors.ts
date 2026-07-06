import type { Role } from "@/features/auth/roleColors";

/**
 * Tailwind classes for the role chip in the top bar.
 * Centralised so the chip and any future role-tag components stay in sync.
 */
export const ROLE_CHIP_CLASS: Record<Role, string> = {
  admin: "bg-rose-100 text-rose-900 ring-1 ring-rose-300",
  bookkeeper: "bg-amber-100 text-amber-900 ring-1 ring-amber-300",
  staff: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300",
};