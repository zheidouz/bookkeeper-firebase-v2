import { useContext } from "react";

import { AuthContext, type AuthContextValue } from "@/features/auth/AuthProvider";

/**
 * Hook for components that need the current auth state.
 * Throws if used outside of an <AuthProvider> — that's a developer error,
 * not a runtime condition to handle.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }
  return ctx;
}