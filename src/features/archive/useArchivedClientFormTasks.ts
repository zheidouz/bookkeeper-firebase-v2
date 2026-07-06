// useArchivedClientFormTasks — slice #15 onSnapshot bridge.
//
// Same onSnapshot-into-TanStack-Query-cache pattern as
// useAllClientFormTasks (slice #13). Filters to rows where the
// archive callback (slice #10) or the nightly reconciliation
// (slice #11) has written `archived: true`. Also constrains
// status === 'archived' for extra safety (the callback sets both
// flags; the cron also writes both). Includes a limit(500) cap
// to stay under the emulator's 4MB gRPC message limit on
// accumulated test data.

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

export const archivedClientFormTasksQueryKey = [
  "clientFormTasks",
  "archived",
] as const;

export function useArchivedClientFormTasks(): {
  data: ClientFormTaskRow[];
  status: "loading" | "authenticated";
} {
  const qc = useQueryClient();
  const cache = qc.getQueryData<ClientFormTaskRow[]>(
    archivedClientFormTasksQueryKey,
  );

  useEffect(() => {
    const q = query(
      collection(db, "clientFormTasks"),
      where("archived", "==", true),
      where("status", "==", "archived"),
      orderBy("archivedAt", "desc"),
      limit(500),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: ClientFormTaskRow[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const periodStart = toDate(data.periodStart);
          const archivedAtTs =
            (data.archivedAt as Timestamp | undefined) ?? null;
          return {
            id: d.id,
            clientId: String(data.clientId ?? ""),
            taxFormId: String(data.taxFormId ?? ""),
            assignedBookkeeperId: String(data.assignedBookkeeperId ?? ""),
            frequency: "monthly",
            periodStart,
            periodEnd: toDate(data.periodEnd, periodStart),
            deadlineDate: toDate(data.deadlineDate, periodStart),
            status: "archived",
            archived: true,
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
            archivedAt: archivedAtTs,
            archivedBy:
              (data.archivedBy as string | undefined) ?? null,
            previousTaskId:
              (data.previousTaskId as string | undefined) ?? null,
            nextTaskId: (data.nextTaskId as string | undefined) ?? null,
          };
        });
        qc.setQueryData(archivedClientFormTasksQueryKey, rows);
      },
      () => {
        // Transient error — leave cache as-is.
      },
    );
    return unsub;
  }, [qc]);

  return {
    data: cache ?? [],
    status: "authenticated",
  };
}

function toDate(value: unknown, fallback: Date = new Date(0)): Date {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in (value as Record<string, unknown>)
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return fallback;
}
