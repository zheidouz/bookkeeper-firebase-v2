// UserRowActions — per-row "Change role" + "Disable" buttons.
// Disable sets status=inactive on the user doc (client-side update — admin
// rule permits it). A future slice can re-enable / hard-delete.

import { useState } from "react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { db } from "@/lib/firebaseConfig";
import ChangeRoleDialog from "@/features/users/ChangeRoleDialog";
import type { UserRow } from "@/features/users/useUsers";
import type { Role } from "@/features/auth/roleColors";

interface UserRowActionsProps {
  user: UserRow;
}

export default function UserRowActions({ user }: UserRowActionsProps) {
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleDisable() {
    setBusy(true);
    try {
      await updateDoc(doc(db, "users", user.id), {
        status: user.status === "active" ? "inactive" : "active",
        updatedAt: serverTimestamp(),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => setRoleDialogOpen(true)}
        data-testid={`change-role-${user.id}`}
      >
        Change role
      </Button>
      <Button
        size="sm"
        variant={user.status === "active" ? "destructive" : "outline"}
        onClick={handleDisable}
        disabled={busy}
        data-testid={`toggle-status-${user.id}`}
      >
        {busy
          ? "Saving…"
          : user.status === "active"
            ? "Disable"
            : "Enable"}
      </Button>
      <ChangeRoleDialog
        uid={user.id}
        currentRole={(user.role as Role) ?? null}
        open={roleDialogOpen}
        onOpenChange={setRoleDialogOpen}
      />
    </div>
  );
}