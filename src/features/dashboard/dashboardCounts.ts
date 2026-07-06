// Dashboard domain types + pure aggregators (no React, no Firestore).
//
// Split out of useDashboardCounts.ts so the pure logic stays
// unit-testable without dragging in firebase / @tanstack/react-query
// at import time (the firebase config initializes Firebase Auth at
// module-evaluation time, which fails in unit tests under the
// default vitest setup).

import type { TaskStatus } from "@/features/clientFormTasks/clientFormTaskSchema";

export type { TaskStatus };

export type DashboardScope = "mine" | "all";

export interface TaskForCounts {
  status: TaskStatus;
  deadlineDate: Date;
  assignedBookkeeperId: string;
  /** Mirror of the `archived` boolean field; either flag counts. */
  archived?: boolean;
}

export interface DashboardCounts {
  pending: number;
  readyToFile: number;
  submitted: number;
  done: number;
  overdue: number;
  dueThisMonth: number;
  dueThisQuarter: number;
  archived: number;
}

export const ZERO_COUNTS: DashboardCounts = {
  pending: 0,
  readyToFile: 0,
  submitted: 0,
  done: 0,
  overdue: 0,
  dueThisMonth: 0,
  dueThisQuarter: 0,
  archived: 0,
};

/** A task is "archived" if its status flag OR its archived field says so. */
function isArchived(t: TaskForCounts): boolean {
  return t.status === "archived" || t.archived === true;
}

/** Quarter of a Date in UTC (0-indexed: Q1=0..Q4=3). */
function utcQuarter(d: Date): number {
  return Math.floor(d.getUTCMonth() / 3);
}

/** True when `d` falls in the same UTC calendar month as `now`. */
export function isSameUtcMonth(d: Date, now: Date): boolean {
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth()
  );
}

/** True when `d` falls in the same UTC calendar quarter as `now`. */
export function isSameUtcQuarter(d: Date, now: Date): boolean {
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    utcQuarter(d) === utcQuarter(now)
  );
}

/**
 * Pure 8-card aggregator. Counts are inclusive of `archived` tasks
 * for the `archived` card; all other cards exclude archived rows
 * (the dashboard is the firm's active pipeline at a glance).
 */
export function computeDashboardCounts(
  tasks: readonly TaskForCounts[],
  scope: DashboardScope,
  currentUserId: string,
  now: Date = new Date(),
): DashboardCounts {
  const scoped =
    scope === "mine"
      ? tasks.filter((t) => t.assignedBookkeeperId === currentUserId)
      : tasks.slice();

  let pending = 0;
  let readyToFile = 0;
  let submitted = 0;
  let done = 0;
  let overdue = 0;
  let dueThisMonth = 0;
  let dueThisQuarter = 0;
  let archived = 0;

  const nowMs = now.getTime();

  for (const t of scoped) {
    if (isArchived(t)) {
      archived += 1;
      continue;
    }
    switch (t.status) {
      case "pending":
        pending += 1;
        break;
      case "ready_to_file":
        readyToFile += 1;
        break;
      case "submitted":
        submitted += 1;
        break;
      case "done":
        done += 1;
        break;
      default:
        // "archived" already handled above
        break;
    }
    const deadlineMs = t.deadlineDate?.getTime?.() ?? 0;
    if (deadlineMs < nowMs && t.status !== "done") {
      overdue += 1;
    }
    if (isSameUtcMonth(t.deadlineDate, now)) {
      dueThisMonth += 1;
    }
    if (isSameUtcQuarter(t.deadlineDate, now)) {
      dueThisQuarter += 1;
    }
  }

  return {
    pending,
    readyToFile,
    submitted,
    done,
    overdue,
    dueThisMonth,
    dueThisQuarter,
    archived,
  };
}

/**
 * URGENCY colour for a single task card / list-row, driven by
 * workflow status + deadline (NOT the workflow status colour —
 * that's what StatusBadge does).
 *   - "archived" — grey
 *   - "overdue"  — red    (status not done/archived AND past due)
 *   - "urgent"   — yellow (≤ 14 days remaining)
 *   - "normal"   — green  (everything else)
 */
export type TaskUrgency = "overdue" | "urgent" | "normal" | "archived";

export function computeTaskUrgency(
  status: TaskStatus,
  deadlineDate: Date,
  now: Date = new Date(),
  archived: boolean = false,
): TaskUrgency {
  if (status === "archived" || archived) return "archived";
  const diffMs = deadlineDate.getTime() - now.getTime();
  const URGENT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
  if (status === "done") return "normal";
  if (diffMs < 0) return "overdue";
  if (diffMs <= URGENT_WINDOW_MS) return "urgent";
  return "normal";
}

export const URGENCY_BG_CLASS: Record<TaskUrgency, string> = {
  overdue: "bg-red-100 text-red-900 border-red-200",
  urgent: "bg-amber-100 text-amber-900 border-amber-200",
  normal: "bg-emerald-100 text-emerald-900 border-emerald-200",
  archived: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

export const URGENCY_LABEL: Record<TaskUrgency, string> = {
  overdue: "Overdue",
  urgent: "Due soon",
  normal: "On track",
  archived: "Archived",
};