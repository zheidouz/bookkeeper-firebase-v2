// useAllClientFormTasks — slice #13 (task table) onSnapshot bridge.
//
// Mirrors useClientFormTasks but for the WHOLE collection (no
// clientId filter) so the /tasks page can show every active task.
// Filters by `archived === false` (current tasks only) and supports
// the slice #12 scope toggle ('mine' vs 'all').
//
// Same onSnapshot-into-TanStack-Query-cache pattern as the rest of
// the app. The actual sort/filter/paginate is handled in pure
// functions in src/features/tasks/taskTableReducer.ts; this hook is
// only the data pipeline.

import { useEffect } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";

import { db } from "@/lib/firebaseConfig";
import type { ClientFormTaskRow } from "@/features/clientFormTasks/useClientFormTasks";

export const allClientFormTasksQueryKey = [
  "clientFormTasks",
  "all",
] as const;

export type AllClientFormTasksScope = "mine" | "all";

export interface UseAllClientFormTasksOptions {
  scope?: AllClientFormTasksScope;
  currentUserId?: string;
}

function toDate(value: unknown, fallback: Date): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return fallback;
}

export function useAllClientFormTasks(
  options: UseAllClientFormTasksOptions = {},
): { data: ClientFormTaskRow[]; status: "loading" | "authenticated" } {
  const { scope = "all", currentUserId = "" } = options;
  const qc = useQueryClient();
  const cache = qc.getQueryData<ClientFormTaskRow[]>(
    allClientFormTasksQueryKey,
  );

  useEffect(() => {
    const constraints = [where("archived", "==", false)];
    if (scope === "mine" && currentUserId) {
      constraints.push(where("assignedBookkeeperId", "==", currentUserId));
    }
    const q = query(
      collection(db, "clientFormTasks"),
      ...constraints,
      orderBy("deadlineDate", "asc"),
      // Match the dashboard's cap — keeps the emulator gRPC message
      // under 4MB even when test residue accumulates across runs. A
      // production deployment with >500 active tasks would paginate
      // or use Firestore aggregation queries.
      limit(500),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: ClientFormTaskRow[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const periodStart = toDate(data.periodStart, new Date(0));
          return {
            id: d.id,
            clientId: String(data.clientId ?? ""),
            taxFormId: String(data.taxFormId ?? ""),
            assignedBookkeeperId: String(data.assignedBookkeeperId ?? ""),
            frequency: "monthly",
            periodStart,
            periodEnd: toDate(data.periodEnd, periodStart),
            deadlineDate: toDate(data.deadlineDate, periodStart),
            status: ((): ClientFormTaskRow["status"] => {
              switch (data.status) {
                case "pending":
                case "ready_to_file":
                case "submitted":
                case "done":
                case "archived":
                  return data.status;
                default:
                  return "pending";
              }
            })(),
            archived: data.archived === true,
            year:
              typeof data.year === "number"
                ? data.year
                : periodStart.getUTCFullYear(),
            monthOrQuarter:
              typeof data.monthOrQuarter === "number"
                ? data.monthOrQuarter
                : null,
            notes: String(data.notes ?? ""),
            createdAt: (data.createdAt as Timestamp | undefined) ?? null,
            updatedAt: (data.updatedAt as Timestamp | undefined) ?? null,
            archivedAt: (data.archivedAt as Timestamp | undefined) ?? null,
            archivedBy:
              (data.archivedBy as string | undefined) ?? null,
            previousTaskId:
              (data.previousTaskId as string | undefined) ?? null,
            nextTaskId: (data.nextTaskId as string | undefined) ?? null,
          };
        });
        qc.setQueryData(allClientFormTasksQueryKey, rows);
      },
      () => {
        // Transient error — leave cache alone.
      },
    );
    return unsub;
  }, [currentUserId, qc, scope]);

  return {
    data: cache ?? [],
    status: "authenticated",
  };
}

