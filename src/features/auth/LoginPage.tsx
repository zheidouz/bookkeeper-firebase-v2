import { useState, type FormEvent } from "react";
import { Navigate, useLocation, type Location } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/useAuth";

type LocationState = { from?: { pathname?: string } } | null;

/**
 * Email + password login.
 *
 * - Already-authenticated users are bounced to "/" (or to where they came from).
 * - Submit calls `signIn` from AuthProvider. Errors come back as a friendly
 *   string and render in an inline <Alert> — no console logging.
 */
export default function LoginPage() {
  const { status, signIn } = useAuth();
  const location = useLocation() as Location & { state: LocationState };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // While we're figuring out the auth state, show a spinner so we don't
  // briefly flash the login form for a signed-in user.
  if (status === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center bg-slate-50"
      >
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (status === "authenticated") {
    const dest = location.state?.from?.pathname || "/";
    return <Navigate to={dest} replace />;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    const result = await signIn(email, password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
    }
    // On success, the auth-state listener flips status to "authenticated",
    // and the Navigate above kicks in on the next render.
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Bookkeeper &amp; Tax Filing Dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                data-testid="login-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                data-testid="login-password"
              />
            </div>

            {error ? (
              <div
                role="alert"
                data-testid="login-error"
                className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900"
              >
                {error}
              </div>
            ) : null}

            <Button
              type="submit"
              className="w-full"
              disabled={submitting}
              data-testid="login-submit"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}