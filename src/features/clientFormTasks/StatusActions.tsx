// StatusActions — slice #9 (status workflow + audit history).
//
// Inline quick-transition controls for a single task row. Renders a
// button for each legal next-status returned by the reducer, plus a
// "Change with note…" button that opens ChangeStatusDialog.
//
// The component does NOT decide whether the actor is allowed to make
// a transition — the visibility call lives in the parent (the row
// only mounts <StatusActions> when the actor is the assigned
// bookkeeper or an admin). The batched-write itself runs under
// Firestore rules that repeat the check.

import { useState } from "react";

import { Button } from "@/components/ui/button";

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
import ChangeStatusDialog from "@/features/clientFormTasks/ChangeStatusDialog";

interface StatusActionsProps {
  task: ClientFormTaskRow;
  /**
   * Inline (the default) renders a single row of buttons that fits
   * inside an AttachedTaskRow's actions cell. `stacked` swaps
   * `flex` for `flex-col` for use in more spacious layouts.
   */
  variant?: "inline" | "stacked";
  onSaved?: () => void;
}

export default function StatusActions({
  task,
  variant = "inline",
  onSaved,
}: StatusActionsProps) {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const legalNext = getLegalNextStatuses(task.status);

  async function quickTransition(next: (typeof legalNext)[number]) {
    if (!user?.uid) {
      setError("Not signed in.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await transitionTaskStatus({
        taskId: task.id,
        fromStatus: task.status,
        toStatus: next,
        changedBy: user.uid,
      });
      onSaved?.();
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

  if (legalNext.length === 0) {
    // Terminal state — nothing to render in the actions slot. Parent
    // components can show archive/follow-up affordances in a later
    // slice (#10). For #9 we render a faint dash so the cell layout
    // doesn't shift.
    return null;
  }

  const containerClass =
    variant === "stacked"
      ? "flex flex-col gap-2"
      : "flex flex-wrap gap-1";

  return (
    <div
      className={containerClass}
      data-testid={`status-actions-${task.id}`}
    >
      {legalNext.map((next) => (
        <Button
          key={next}
          type="button"
          size="sm"
          variant="outline"
          onClick={() => quickTransition(next)}
          disabled={busy}
          data-testid={`status-action-${task.id}-${next}`}
        >
          Mark as {STATUS_LABELS_LONG[next]}
        </Button>
      ))}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setDialogOpen(true)}
        disabled={busy}
        data-testid={`status-action-${task.id}-change-with-note`}
      >
        Change with note…
      </Button>
      {error && (
        <div
          role="alert"
          data-testid={`status-actions-error-${task.id}`}
          className="w-full text-xs text-destructive"
        >
          {error}
        </div>
      )}
      <ChangeStatusDialog
        task={task}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={onSaved}
      />
    </div>
  );
}
