// TaxFormRowActions — per-row "Edit" + "Disable/Enable" buttons.
// Disable flips isActive: false (visible in the table but greyed out, and
// excluded from future "active selectors" in attach-to-client UIs).

import { useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";

import { Button } from "@/components/ui/button";

import { db } from "@/lib/firebaseConfig";
import EditTaxFormDialog from "@/features/taxForms/EditTaxFormDialog";
import type { TaxFormRow } from "@/features/taxForms/useTaxForms";

interface TaxFormRowActionsProps {
  form: TaxFormRow;
}

export default function TaxFormRowActions({ form }: TaxFormRowActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleToggleActive() {
    setBusy(true);
    try {
      await updateDoc(doc(db, "taxForms", form.id), {
        isActive: !form.isActive,
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
        onClick={() => setEditOpen(true)}
        data-testid={`edit-tax-form-${form.formCode}`}
      >
        Edit
      </Button>
      <Button
        size="sm"
        variant={form.isActive ? "destructive" : "outline"}
        onClick={handleToggleActive}
        disabled={busy}
        data-testid={`toggle-tax-form-${form.formCode}`}
      >
        {busy ? "Saving…" : form.isActive ? "Disable" : "Enable"}
      </Button>
      <EditTaxFormDialog
        form={form}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}
