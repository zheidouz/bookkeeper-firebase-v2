// statusReducer — slice #9 (status workflow + audit history).
//
// Pure helper that derives the "legal next" task statuses from the
// current one, plus an `isLegalTransition` predicate for batched writes.
//
// The workflow the UI enforces:
//
//   pending      → ready_to_file
//   ready_to_file → submitted
//   submitted    → done
//   done         → (terminal — slice #10 adds the Archive action)
//
// "archived" is NOT a legal target from the workflow — the Archive
// callable / button (slice #10) is the only path into that state, so
// it stays out of the reducer. getLegalNextStatuses returns an
// empty array for both `done` and `archived` to make the UI call it
// once and render whatever buttons come back.

import type { TaskStatus } from "@/features/clientFormTasks/clientFormTaskSchema";

/**
 * Return the legal next statuses for a given current status.
 *
 * The result is the set of statuses the UI should render a "quick"
 * transition button for. The set is empty for terminal states
 * (`done`, `archived`).
 */
export function getLegalNextStatuses(current: TaskStatus): TaskStatus[] {
  switch (current) {
    case "pending":
      return ["ready_to_file"];
    case "ready_to_file":
      return ["submitted"];
    case "submitted":
      return ["done"];
    case "done":
      return [];
    case "archived":
      return [];
  }
}

/**
 * Predicate: is moving from `from` to `to` a legal workflow step?
 *
 * Mirrors `getLegalNextStatuses` but returns a flat boolean. Used by
 * the batched-write path to short-circuit before opening a writeBatch
 * and by the unit tests as the single source of truth.
 */
export function isLegalTransition(
  from: TaskStatus,
  to: TaskStatus,
): boolean {
  return getLegalNextStatuses(from).includes(to);
}

/**
 * Human-readable label for a status. Used by the StatusActions
 * buttons ("Mark as Ready to file") and the ChangeStatusDialog.
 *
 * Kept here (next to the reducer) rather than in StatusBadge so
 * callers that don't render a badge get the same wording.
 */
export const STATUS_LABELS_LONG: Record<TaskStatus, string> = {
  pending: "Pending",
  ready_to_file: "Ready to file",
  submitted: "Submitted",
  done: "Done",
  archived: "Archived",
};
