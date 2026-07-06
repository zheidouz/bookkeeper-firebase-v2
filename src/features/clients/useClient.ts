// useClient — single-doc TanStack Query + onSnapshot bridge for
// /clients/{id}. Uses the same caching strategy as useClients but
// keys the cache by id so the detail page can subscribe independently
// to one row.

import { useEffect } from "react";
import { doc, onSnapshot, type Timestamp } from "firebase/firestore";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { db } from "@/lib/firebaseConfig";
import type { ClientStatus } from "@/features/clients/clientSchema";

export interface ClientDetail extends ClientRecord {
  id: string;
}

// Re-export alias so the detail page can reference the narrow shape
// without pulling from useClients.
export interface ClientRecord {
  businessName: string;
  ownerName: string;
  tin: string;
  rdo: string;
  address: string;
  contactNumber: string;
  email: string;
  assignedBookkeeperId: string;
  status: ClientStatus;
  notes: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export const clientDetailQueryKey = (id: string | undefined) =>
  ["client", id] as const;

function normalizeStatus(value: unknown): ClientStatus {
  return value === "archived" || value === "inactive" || value === "active"
    ? value
    : "active";
}

export function useClient(id: string | undefined) {
  const qc = useQueryClient();
  const key = clientDetailQueryKey(id);

  useEffect(() => {
    if (!id) return;
    const ref = doc(db, "clients", id);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          qc.setQueryData(key, null);
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        const row: ClientDetail = {
          id: snap.id,
          businessName: String(data.businessName ?? ""),
          ownerName: String(data.ownerName ?? ""),
          tin: String(data.tin ?? ""),
          rdo: String(data.rdo ?? ""),
          address: String(data.address ?? ""),
          contactNumber: String(data.contactNumber ?? ""),
          email: String(data.email ?? ""),
          assignedBookkeeperId: String(data.assignedBookkeeperId ?? ""),
          status: normalizeStatus(data.status),
          notes: String(data.notes ?? ""),
          createdAt: (data.createdAt as Timestamp | undefined) ?? null,
          updatedAt: (data.updatedAt as Timestamp | undefined) ?? null,
        };
        qc.setQueryData(key, row);
      },
      () => {
        // Permission denied or doc gone — leave the cache.
      },
    );
    return unsub;
  }, [id, key, qc]);

  return useQuery<ClientDetail | null>({
    queryKey: key,
    queryFn: () => null,
    enabled: !!id,
  });
}
