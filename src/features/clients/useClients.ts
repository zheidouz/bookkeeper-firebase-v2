// useClients — TanStack Query + onSnapshot bridge for /clients.
//
// Same pattern as useUsers / useTaxForms: a no-op queryFn so TanStack
// Query owns loading/error shape, plus a useEffect that opens an
// onSnapshot and pushes snapshot rows into the cache. The page and
// the detail page both read from the cache; archive/edit calls rely
// on the snapshot to push the updated row back into the UI on its
// own (no manual cache.setQueryData needed).

import { useEffect } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  type Timestamp,
} from "firebase/firestore";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { db } from "@/lib/firebaseConfig";
import type { ClientStatus } from "@/features/clients/clientSchema";

export interface ClientRow {
  id: string;
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

export const CLIENTS_QUERY_KEY = ["clients"] as const;

function normalizeStatus(value: unknown): ClientStatus {
  return value === "archived" || value === "inactive" || value === "active"
    ? value
    : "active";
}

export function useClients() {
  const qc = useQueryClient();

  useEffect(() => {
    const q = query(collection(db, "clients"), orderBy("businessName", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: ClientRow[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
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
        });
        qc.setQueryData(CLIENTS_QUERY_KEY, rows);
      },
      () => {
        // Snapshots can fail (permission-denied for staff). Leave the
        // cache as-is; the page renders appropriately.
      },
    );
    return unsub;
  }, [qc]);

  return useQuery<ClientRow[]>({
    queryKey: CLIENTS_QUERY_KEY,
    queryFn: () => [],
  });
}
