// Dashboard test fixtures — small, deterministic shapes used by the
// pure aggregator and urgency-helper unit tests.
//
// Kept deliberately tiny so each test reads as a one-glance scenario.

import type {
  TaskForCounts,
} from "@/features/dashboard/dashboardCounts";
import type { TaskStatus } from "@/features/clientFormTasks/clientFormTaskSchema";

export type { TaskStatus };

export function task(partial: {
  status?: TaskStatus;
  /** ms-since-epoch */
  deadlineMs?: number;
  assignedBookkeeperId?: string;
  archived?: boolean;
}): TaskForCounts {
  return {
    status: partial.status ?? "pending",
    deadlineDate: new Date(partial.deadlineMs ?? Date.UTC(2026, 6, 15)),
    assignedBookkeeperId: partial.assignedBookkeeperId ?? "bk-1",
    archived: partial.archived ?? false,
  };
}

/** Anchor date for the aggregator tests. 2026-07-15T12:00:00Z. */
export const FIXED_NOW = new Date(Date.UTC(2026, 6, 15, 12, 0, 0));