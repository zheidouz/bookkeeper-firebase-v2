// AttachedTaskRow — slice #8 + #9. One row in the AttachedFormsSection
// table. Renders the form code + name (joined from the taxForms
// cache), frequency, period range, deadline, status badge, and
// Edit / Remove buttons for tasks that are still in `pending`
// status AND editable by the current user (admin OR assigned
// bookkeeper).
//
// Slice #9 adds:
//   * <StatusActions> — inline quick-transition buttons + the
//     "Change with note…" dialog.
//   * A history disclosure that mounts <useTaskStatusHistory> and
//     renders the rows newest-first.
//   * Status-actions visibility: hidden entirely unless the actor is
//     the assigned bookkeeper or an admin (same gate as before, but
//     extended to non-pending statuses now that they can advance).

import { useState } from "react";
import { deleteDoc, doc } from "firebase/firestore";

import { Button } from "@/components/ui/button";

import { db } from "@/lib/firebaseConfig";
import { useAuth } from "@/features/auth/useAuth";
import StatusBadge from "@/features/clientFormTasks/StatusBadge";
import StatusActions from "@/features/clientFormTasks/StatusActions";
import EditTaskDialog from "@/features/clientFormTasks/EditTaskDialog";
import { useTaskStatusHistory } from "@/features/clientFormTasks/useTaskStatusHistory";
import {
  STATUS_LABELS_LONG,
  getLegalNextStatuses,
} from "@/features/clientFormTasks/statusReducer";
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

function formatRelative(timestamp: { toDate: () => Date } | null | undefined): string {
  if (!timestamp) return "—";
  const d = timestamp.toDate();
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export default function AttachedTaskRow({
  task,
  taxForm,
}: AttachedTaskRowProps) {
  const { user, role } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const isAdmin = role === "admin";
  const isAssigned = user?.uid === task.assignedBookkeeperId;
  const canModify = task.status === "pending" && (isAdmin || isAssigned);
  const canChangeStatus = isAdmin || isAssigned;
  const legalNext = getLegalNextStatuses(task.status);

  const { data: history } = useTaskStatusHistory(
    canChangeStatus || historyOpen ? task.id : undefined,
  );

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
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={task.status} />
          {canChangeStatus && legalNext.length > 0 && (
            <div className="mt-1">
              <StatusActions task={task} />
            </div>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-right text-sm">
        <div className="flex flex-col items-end gap-2">
          <div className="flex justify-end gap-2">
            {canModify ? (
              <>
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
              </>
            ) : (
              <span className="text-xs text-slate-400">—</span>
            )}
          </div>
          <div>
            <button
              type="button"
              onClick={() => setHistoryOpen((cur) => !cur)}
              className="text-xs font-medium text-slate-500 underline hover:text-slate-700"
              data-testid={`attached-task-history-toggle-${task.id}`}
            >
              {historyOpen ? "Hide history" : "Show history"}
            </button>
            {historyOpen && (
              <div
                className="mt-2 max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-2 text-left"
                data-testid={`attached-task-history-${task.id}`}
              >
                {!history || history.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    No status changes yet.
                  </p>
                ) : (
                  <ul className="space-y-1.5 text-xs">
                    {history.map((row) => (
                      <li
                        key={row.id}
                        data-testid={`attached-task-history-row-${task.id}-${row.id}`}
                        className="flex flex-col gap-0.5"
                      >
                        <div className="flex flex-wrap items-center gap-1 text-slate-700">
                          <StatusBadge
                            status={row.oldStatus}
                            compact
                          />
                          <span className="text-slate-700 font-medium">
                            {STATUS_LABELS_LONG[row.oldStatus]}
                          </span>
                          <span className="text-slate-400">→</span>
                          <StatusBadge
                            status={row.newStatus}
                            compact
                          />
                          <span className="text-slate-700 font-medium">
                            {STATUS_LABELS_LONG[row.newStatus]}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-500">
                            {formatRelative(row.changedAt)}
                          </span>
                        </div>
                        {row.notes && (
                          <div className="text-slate-600">{row.notes}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          {error && (
            <div
              role="alert"
              data-testid={`attached-task-row-error-${task.id}`}
              className="mt-1 text-right text-xs text-destructive"
            >
              {error}
            </div>
          )}
        </div>
      </td>
      <EditTaskDialog
        task={task}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </tr>
  );
}
