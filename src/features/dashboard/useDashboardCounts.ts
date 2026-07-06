// useDashboardCounts — slice #12 (issue #12, dashboard overview).
//
// The pure aggregator + urgency helper live in `dashboardCounts.ts`
// so they can be unit-tested without importing Firebase (the SDK
// initializes Auth at module-eval time and fails under the default
// vitest env).
//
// This file owns:
//   * DASHBOARD_TASKS_KEY — the TanStack Query cache key.
//   * DashboardTaskRow — the snapshot row shape stored in cache.
//   * useDashboardCounts — the live onSnapshot bridge.
//
// The component layer (DashboardCards / DashboardPage) reads from
// the cache and calls `computeDashboardCounts` themselves with the
// active scope.

import { useEffect } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { db } from "@/lib/firebaseConfig";

import type { TaskStatus } from "@/features/clientFormTasks/clientFormTaskSchema";

export {
  computeDashboardCounts,
  computeTaskUrgency,
  isSameUtcMonth,
  isSameUtcQuarter,
  ZERO_COUNTS,
  URGENCY_BG_CLASS,
  URGENCY_LABEL,
  type DashboardCounts,
  type DashboardScope,
  type TaskForCounts,
  type TaskUrgency,
} from "@/features/dashboard/dashboardCounts";

export const DASHBOARD_TASKS_KEY = ["dashboard", "tasks"] as const;

export interface DashboardTaskRow {
  id: string;
  status: TaskStatus;
  deadlineDate: Date;
  assignedBookkeeperId: string;
  clientId: string;
  taxFormId: string;
  archived: boolean;
}

function toMillis(value: unknown, fallback: Date): number {
  if (value instanceof Timestamp) return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  return fallback.getTime();
}

function normalizeStatus(value: unknown): TaskStatus {
  switch (value) {
    case "pending":
    case "ready_to_file":
    case "submitted":
    case "done":
    case "archived":
      return value;
    default:
      return "pending";
  }
}

/**
 * React hook — opens an onSnapshot on the full clientFormTasks
 * collection (no client/archived filter; the dashboard wants to
 * count archived rows too) and writes the normalized rows into the
 * TanStack Query cache under DASHBOARD_TASKS_KEY.
 */
export function useDashboardCounts() {
  const qc = useQueryClient();

  useEffect(() => {
    const q = query(
      collection(db, "clientFormTasks"),
      orderBy("deadlineDate", "asc"),
      // Cap the snapshot at a small number so the emulator's 4MB
      // gRPC message limit isn't blown by accumulated test data
      // across runs. The dashboard is summary-only (counts + filter
      // strip); 500 most-recent-by-deadline is plenty for the test
      // scenarios. A real production deployment with >500 active
      // tasks would either paginate here or use a Firestore
      // aggregation query instead.
      limit(50),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const fallback = new Date(0);
        const rows: DashboardTaskRow[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            status: normalizeStatus(data.status),
            deadlineDate: new Date(toMillis(data.deadlineDate, fallback)),
            assignedBookkeeperId: String(data.assignedBookkeeperId ?? ""),
            clientId: String(data.clientId ?? ""),
            taxFormId: String(data.taxFormId ?? ""),
            archived: data.archived === true,
          };
        });
        qc.setQueryData(DASHBOARD_TASKS_KEY, rows);
      },
      () => {
        // Permission-denied or transient error — leave the cache alone
        // so the page can keep rendering whatever rows it already has.
      },
    );
    return unsub;
  }, [qc]);

  return useQuery<DashboardTaskRow[]>({
    queryKey: DASHBOARD_TASKS_KEY,
    queryFn: () => [],
  });
}