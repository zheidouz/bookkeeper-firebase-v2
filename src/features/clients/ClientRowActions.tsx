// ClientRowActions — per-row View + Edit + Archive/Restore buttons.
// Soft-archive sets status='archived' (visible only when "Show archived"
// is on). Restore sets status='active'. Both use updateDoc +
// serverTimestamp and rely on the snapshot listener to repaint the row.

import { useState } from "react";
import { Link } from "react-router-dom";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";

import { Button } from "@/components/ui/button";

import { db } from "@/lib/firebaseConfig";
import EditClientDialog from "@/features/clients/EditClientDialog";
import type { ClientRow } from "@/features/clients/useClients";

interface ClientRowActionsProps {
  client: ClientRow;
}

export default function ClientRowActions({ client }: ClientRowActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const isArchived = client.status === "archived";

  async function handleToggleArchive() {
    setBusy(true);
    try {
      await updateDoc(doc(db, "clients", client.id), {
        status: isArchived ? "active" : "archived",
        updatedAt: serverTimestamp(),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        asChild
        size="sm"
        variant="ghost"
        data-testid={`view-client-${client.id}`}
      >
        <Link to={`/clients/${client.id}`}>View</Link>
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setEditOpen(true)}
        data-testid={`edit-client-${client.id}`}
      >
        Edit
      </Button>
      <Button
        size="sm"
        variant={isArchived ? "outline" : "destructive"}
        onClick={handleToggleArchive}
        disabled={busy}
        data-testid={`archive-client-${client.id}`}
      >
        {busy ? "Saving…" : isArchived ? "Restore" : "Archive"}
      </Button>
      <EditClientDialog
        client={client}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}
