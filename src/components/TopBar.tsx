import LogoutButton from "@/features/auth/LogoutButton";
import RoleChip from "@/features/auth/RoleChip";
import { useAuth } from "@/features/auth/useAuth";

/**
 * The top bar that sits above the main content area.
 *
 * Shows the app title on the left and the current user's name + role chip
 * + logout button on the right.
 */
export default function TopBar() {
  const { user, role } = useAuth();
  const displayName =
    user?.displayName?.trim() ||
    (user?.email ? user.email.split("@")[0] : null) ||
    "User";

  return (
    <header
      data-testid="top-bar"
      className="flex h-14 items-center justify-between border-b bg-white px-6"
    >
      <div className="text-base font-semibold text-slate-900">
        Bookkeeper Dashboard
      </div>
      <div className="flex items-center gap-3">
        <span
          data-testid="user-display-name"
          className="text-sm text-slate-700"
        >
          {displayName}
        </span>
        <RoleChip role={role} />
        <LogoutButton />
      </div>
    </header>
  );
}