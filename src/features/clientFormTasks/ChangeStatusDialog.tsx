// ChangeStatusDialog — slice #9 (status workflow + audit history).
//
// Modal that lets the actor change a task's status while attaching
// an optional free-text note. The note is written to the audit row
// alongside the transition. Notes are NOT required — the user can
// leave the textarea blank.
//
// Splitting this off from StatusActions keeps that component small
// (just renders the quick-transition buttons + "Change with note…")
// while the dialog owns the textarea + submit.

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useAuth } from "@/features/auth/useAuth";
import type { ClientFormTaskRow } from "@/features/clientFormTasks/useClientFormTasks";
import {
  STATUS_LABELS_LONG,
  getLegalNextStatuses,
} from "@/features/clientFormTasks/statusReducer";
import {
  IllegalStatusTransitionError,
  transitionTaskStatus,
} from "@/features/clientFormTasks/useTaskStatusTransition";
import type { TaskStatus } from "@/features/clientFormTasks/clientFormTaskSchema";

interface ChangeStatusDialogProps {
  task: ClientFormTaskRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export default function ChangeStatusDialog({
  task,
  open,
  onOpenChange,
  onSaved,
}: ChangeStatusDialogProps) {
  const { user } = useAuth();
  const legalNext = getLegalNextStatuses(task.status);
  // Default the select to the first legal next-status so the user
  // can submit without touching it when the intent is the common
  // case (advance by one step).
  const [target, setTarget] = useState<TaskStatus | "">(
    legalNext[0] ?? "",
  );
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTarget(legalNext[0] ?? "");
      setNotes("");
      setError(null);
    }
    // legalNext is derived from task.status; reopen after a status
    // change means the next legal step has changed too, so reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task.id, task.status]);

  function handleOpenChange(next: boolean) {
    if (!next) setError(null);
    onOpenChange(next);
  }

  async function onSubmit() {
    if (!target) {
      setError("Pick a target status.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const changedBy = user?.uid ?? task.assignedBookkeeperId;
      await transitionTaskStatus({
        taskId: task.id,
        fromStatus: task.status,
        toStatus: target,
        changedBy,
        notes: notes.trim(),
      });
      onSaved?.();
      handleOpenChange(false);
    } catch (err) {
      if (err instanceof IllegalStatusTransitionError) {
        setError(err.message);
      } else {
        const msg =
          err && typeof err === "object" && "message" in err
            ? String((err as { message: unknown }).message)
            : "Failed to change status.";
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change status</DialogTitle>
          <DialogDescription>
            Move the task to a legal next status. The note is optional
            and saved with the audit row.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="change-status-target"
              className="text-sm font-medium"
            >
              New status
            </label>
            <select
              id="change-status-target"
              data-testid="change-status-target"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={target}
              onChange={(e) =>
                setTarget(e.target.value as TaskStatus | "")
              }
              disabled={legalNext.length === 0 || busy}
            >
              {legalNext.length === 0 && (
                <option value="">No further status changes available.</option>
              )}
              {legalNext.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS_LONG[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="change-status-notes"
              className="text-sm font-medium"
            >
              Note (optional)
            </label>
            <textarea
              id="change-status-notes"
              data-testid="change-status-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={busy}
              placeholder="Why are we changing the status?"
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          {error && (
            <div
              role="alert"
              data-testid="change-status-error"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={busy || !target}
            data-testid="change-status-submit"
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
