import { ROLE_CHIP_CLASS } from "@/lib/roleColors";
import type { Role } from "@/features/auth/roleColors";

export default function RoleChip({ role }: { role: Role }) {
  return (
    <span
      data-testid="role-chip"
      data-role={role}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${ROLE_CHIP_CLASS[role]}`}
    >
      {role}
    </span>
  );
}