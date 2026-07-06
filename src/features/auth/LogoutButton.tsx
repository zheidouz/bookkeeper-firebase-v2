import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/useAuth";

export default function LogoutButton() {
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      await signOut();
    } finally {
      // Whether or not signOut throws, the auth state listener will eventually
      // redirect via RequireAuth — we don't need to navigate here.
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={busy}
      data-testid="logout-button"
    >
      {busy ? "Signing out…" : "Sign out"}
    </Button>
  );
}