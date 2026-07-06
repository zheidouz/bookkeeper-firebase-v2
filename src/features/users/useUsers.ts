// useUsers — TanStack Query + onSnapshot bridge for the /users collection.
//
// Strategy: a no-op `queryFn` (returns []) so TanStack Query owns the
// loading/error states, plus a useEffect that opens an onSnapshot and
// pushes snapshot results into the query cache. The page renders off
// the cache and gets real-time updates for free.

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
import type { Role } from "@/features/auth/roleColors";

export type UserStatus = "active" | "inactive";

export interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  status: UserStatus;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export const USERS_QUERY_KEY = ["users"] as const;

export function useUsers() {
  const qc = useQueryClient();

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: UserRow[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: (data.name as string | null | undefined) ?? null,
            email: (data.email as string | undefined) ?? "",
            role: (data.role as Role | undefined) ?? "staff",
            status: (data.status as UserStatus | undefined) ?? "active",
            createdAt: data.createdAt ?? null,
            updatedAt: data.updatedAt ?? null,
          };
        });
        qc.setQueryData(USERS_QUERY_KEY, rows);
      },
      () => {
        // Snapshots can fail (e.g. permission-denied for non-admin). Leave
        // the cache as-is; the page renders <Forbidden /> independently.
      },
    );
    return unsub;
  }, [qc]);

  return useQuery<UserRow[]>({
    queryKey: USERS_QUERY_KEY,
    queryFn: () => [],
  });
}