// AttachedTaskRow — one row in the AttachedFormsSection table. Renders
// the form code + name (joined from the taxForms cache), frequency,
// period range, deadline, status badge, and Edit + Remove buttons
// for tasks that are still in `pending` status and editable by the
// current user (admin OR assigned bookkeeper).

import { useState } from "react";
import { deleteDoc, doc } from "firebase/firestore";

import { Button } from "@/components/ui/button";

import { db } from "@/lib/firebaseConfig";
import { useAuth } from "@/features/auth/useAuth";
import StatusBadge from "@/features/clientFormTasks/StatusBadge";
import EditTaskDialog from "@/features/clientFormTasks/EditTaskDialog";
import type { ClientFormTaskRow } from "@/features/clientFormTasks/useClientFormTasks";
import type { TaxFormRow } from "@/features/taxForms/useTaxForms";

interface AttachedTaskRowProps {
  task: ClientFormTaskRow;
  taxForm: TaxFormRow | undefined;
}

function formatDate(d: Date | undefined): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

export default function AttachedTaskRow({
  task,
  taxForm,
}: AttachedTaskRowProps) {
  const { user, role } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPending = task.status === "pending";
  const isAdmin = role === "admin";
  const isAssigned = user?.uid === task.assignedBookkeeperId;
  const canModify = isPending && (isAdmin || isAssigned);

  async function handleRemove() {
    if (!canModify) return;
    if (
      !window.confirm(
        "Remove this pending task? The obligation will no longer be tracked.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteDoc(doc(db, "clientFormTasks", task.id));
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to remove task.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr
      data-testid={`attached-task-row-${task.id}`}
      className="border-b border-slate-200 last:border-b-0"
    >
      <td className="px-3 py-2 text-sm">
        <div className="font-medium text-slate-900">
          {taxForm?.formCode ?? "—"}
        </div>
        <div className="text-xs text-slate-500">
          {taxForm?.formName ?? "Unknown form"}
        </div>
      </td>
      <td className="px-3 py-2 text-sm capitalize text-slate-700">
        {task.frequency.replace("_", "-")}
      </td>
      <td className="px-3 py-2 text-sm text-slate-700">
        {formatDate(task.periodStart)} → {formatDate(task.periodEnd)}
      </td>
      <td className="px-3 py-2 text-sm text-slate-700">
        {formatDate(task.deadlineDate)}
      </td>
      <td className="px-3 py-2 text-sm">
        <StatusBadge status={task.status} />
      </td>
      <td className="px-3 py-2 text-right text-sm">
        {canModify ? (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditOpen(true)}
              data-testid={`attached-task-edit-${task.id}`}
              disabled={busy}
            >
              Edit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleRemove}
              data-testid={`attached-task-remove-${task.id}`}
              disabled={busy}
            >
              Remove
            </Button>
          </div>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
        {error && (
          <div
            role="alert"
            data-testid={`attached-task-row-error-${task.id}`}
            className="mt-1 text-right text-xs text-destructive"
          >
            {error}
          </div>
        )}
      </td>
      <EditTaskDialog
        task={task}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </tr>
  );
}
