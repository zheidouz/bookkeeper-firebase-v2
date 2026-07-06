import { doc, getDoc } from "firebase/firestore";
import type { User } from "firebase/auth";

import { db } from "@/lib/firebaseConfig";
import { DEFAULT_ROLE, isRole, type Role } from "@/features/auth/roleColors";

/**
 * Three-tier role resolution:
 *
 *   1. Firestore users/{uid}.role (authoritative — set by slice #5's adminCreateUser)
 *   2. request.auth.token.role custom claim (eventually consistent w/ Firestore)
 *   3. DEFAULT_ROLE ("staff")
 *
 * Firestore wins because the custom claim can lag behind a recent role change
 * (claims only refresh on sign-in / token refresh). Reading Firestore gives us
 * the freshest answer.
 */
export async function resolveRole(user: User | null): Promise<Role> {
  if (!user) return DEFAULT_ROLE;

  // Tier 1: Firestore users/{uid}.role
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) {
      const data = snap.data() as { role?: unknown };
      if (isRole(data.role)) return data.role;
    }
  } catch {
    // Permission denied / offline — fall through to claim/default.
  }

  // Tier 2: Custom claim
  try {
    const tokenResult = await user.getIdTokenResult(/* forceRefresh */ false);
    const claim = tokenResult.claims.role;
    if (isRole(claim)) return claim;
  } catch {
    // Token refresh failed — fall through.
  }

  // Tier 3: Default
  return DEFAULT_ROLE;
}