// useClientFormTasks — TanStack Query + onSnapshot bridge for the
// clientFormTasks collection filtered to a single client.
//
// Same pattern as useTaxForms / useBookkeepers: a no-op queryFn so
// TanStack Query owns loading/error shape, plus a useEffect that
// opens an onSnapshot filtered by clientId + archived === false and
// pushes snapshot rows into the cache keyed by clientId.
//
// The "current tasks" view filters out archived rows. Slice #15
// (archive page) will mount its own hook without that filter.

import { useEffect } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { db } from "@/lib/firebaseConfig";
import type {
  TaskFrequency,
  TaskStatus,
} from "@/features/clientFormTasks/clientFormTaskSchema";

export interface ClientFormTaskRow {
  id: string;
  clientId: string;
  taxFormId: string;
  assignedBookkeeperId: string;
  frequency: TaskFrequency;
  periodStart: Date;
  periodEnd: Date;
  deadlineDate: Date;
  status: TaskStatus;
  archived: boolean;
  year: number;
  monthOrQuarter: number | null;
  notes: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  archivedAt?: Timestamp | null;
  archivedBy?: string | null;
  previousTaskId?: string | null;
  nextTaskId?: string | null;
}

export const clientFormTasksQueryKey = (clientId: string | undefined) =>
  ["clientFormTasks", clientId] as const;

function toDate(value: unknown, fallback: Date): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return fallback;
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

function normalizeFrequency(value: unknown): TaskFrequency {
  switch (value) {
    case "monthly":
    case "quarterly":
    case "semi_annual":
    case "annual":
    case "custom":
      return value;
    default:
      return "monthly";
  }
}

function asDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    return new Date(value);
  }
  // Fall back to epoch; downstream code uses this only for display.
  return new Date(0);
}

export function useClientFormTasks(clientId: string | undefined) {
  const qc = useQueryClient();
  const key = clientFormTasksQueryKey(clientId);

  useEffect(() => {
    if (!clientId) return;
    const q = query(
      collection(db, "clientFormTasks"),
      where("clientId", "==", clientId),
      where("archived", "==", false),
      orderBy("deadlineDate", "asc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: ClientFormTaskRow[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const periodStart = asDate(data.periodStart);
          return {
            id: d.id,
            clientId: String(data.clientId ?? clientId),
            taxFormId: String(data.taxFormId ?? ""),
            assignedBookkeeperId: String(data.assignedBookkeeperId ?? ""),
            frequency: normalizeFrequency(data.frequency),
            periodStart,
            periodEnd: asDate(data.periodEnd),
            deadlineDate: toDate(data.deadlineDate, periodStart),
            status: normalizeStatus(data.status),
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
        qc.setQueryData(key, rows);
      },
      () => {
        // Permission denied or transient network error — leave the
        // cache as-is so the page can still render whatever it has.
      },
    );
    return unsub;
  }, [clientId, key, qc]);

  return useQuery<ClientFormTaskRow[]>({
    queryKey: key,
    queryFn: () => [],
    enabled: !!clientId,
  });
}
