import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";

import { auth } from "@/lib/firebaseConfig";
import { resolveRole } from "@/features/auth/resolveRole";
import { DEFAULT_ROLE, type Role } from "@/features/auth/roleColors";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export type SignInResult =
  | { ok: true; user: User }
  | { ok: false; error: string };

export interface AuthContextValue {
  user: User | null;
  role: Role;
  status: AuthStatus;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Translates Firebase Auth error codes into user-friendly strings.
 * Anything we don't recognise falls back to a generic message — no raw
 * SDK error messages should ever leak into the UI.
 */
function friendlyAuthError(code: string | undefined): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Invalid email or password.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    default:
      return "Sign-in failed. Please try again.";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(DEFAULT_ROLE);
  const [status, setStatus] = useState<AuthStatus>("loading");
  // Guard against resolving role for the wrong user when auth changes mid-flight.
  const resolvedForUid = useRef<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (next) => {
      if (!next) {
        setUser(null);
        setRole(DEFAULT_ROLE);
        setStatus("unauthenticated");
        resolvedForUid.current = null;
        return;
      }
      setUser(next);
      // Optimistically mark as authenticated so RequireAuth stops showing
      // the loading spinner; role resolution runs in the background.
      setStatus("authenticated");
      const uid = next.uid;
      const r = await resolveRole(next);
      // If the user signed out (or a different user signed in) while we
      // were awaiting, drop the stale result.
      if (resolvedForUid.current !== uid && resolvedForUid.current !== null) return;
      resolvedForUid.current = uid;
      setRole(r);
    });
    return unsub;
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        return { ok: true, user: cred.user };
      } catch (err) {
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code: unknown }).code)
            : undefined;
        return { ok: false, error: friendlyAuthError(code) };
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    await fbSignOut(auth);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, role, status, signIn, signOut }),
    [user, role, status, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}