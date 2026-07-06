// useTaskStatusHistory — slice #9 (status workflow + audit history).
//
// Subscribes to the taskStatusHistory collection for a single task
// and exposes the most recent rows newest-first via TanStack Query.
//
// Same bridge pattern as useClientFormTasks / useTaxForms:
//   - useEffect opens an onSnapshot filtered by taskId
//   - snapshot rows push into the cache under ["taskStatusHistory", taskId]
//   - the returned useQuery hooks into that cache with a no-op queryFn
//
// The hook always returns `[]` for an empty / undefined taskId so
// the UI can render the section header unconditionally.

import { useEffect } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type Timestamp,
} from "firebase/firestore";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { db } from "@/lib/firebaseConfig";
import type { TaskStatus } from "@/features/clientFormTasks/clientFormTaskSchema";

export interface TaskStatusHistoryRow {
  id: string;
  taskId: string;
  oldStatus: TaskStatus;
  newStatus: TaskStatus;
  changedBy: string;
  changedAt: Timestamp | null;
  notes: string;
}

export const taskStatusHistoryQueryKey = (taskId: string | undefined) =>
  ["taskStatusHistory", taskId] as const;

const HISTORY_LIMIT = 50;

export function useTaskStatusHistory(taskId: string | undefined) {
  const qc = useQueryClient();
  const key = taskStatusHistoryQueryKey(taskId);

  useEffect(() => {
    if (!taskId) return;
    const q = query(
      collection(db, "taskStatusHistory"),
      where("taskId", "==", taskId),
      orderBy("changedAt", "desc"),
      limit(HISTORY_LIMIT),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: TaskStatusHistoryRow[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            taskId: String(data.taskId ?? taskId),
            oldStatus:
              typeof data.oldStatus === "string"
                ? (data.oldStatus as TaskStatus)
                : "pending",
            newStatus:
              typeof data.newStatus === "string"
                ? (data.newStatus as TaskStatus)
                : "pending",
            changedBy: String(data.changedBy ?? ""),
            changedAt:
              (data.changedAt as Timestamp | null | undefined) ?? null,
            notes: String(data.notes ?? ""),
          };
        });
        qc.setQueryData(key, rows);
      },
      () => {
        // Permission denied or transient error — leave cache as-is.
      },
    );
    return unsub;
  }, [taskId, key, qc]);

  return useQuery<TaskStatusHistoryRow[]>({
    queryKey: key,
    queryFn: () => [],
    enabled: !!taskId,
  });
}
