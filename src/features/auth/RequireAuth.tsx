import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/features/auth/useAuth";

/**
 * Route guard for protected pages.
 *
 * - status: "loading"          → render a centred spinner (don't redirect yet)
 * - status: "unauthenticated"  → redirect to /login, remembering where the
 *                                 user was trying to go via `state.from`
 * - status: "authenticated"    → render children (or the <Outlet />)
 *
 * Use as a parent route element to guard every child route at once.
 */
export default function RequireAuth({ children }: { children?: React.ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="auth-loading"
        className="flex min-h-screen items-center justify-center bg-slate-50"
      >
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}