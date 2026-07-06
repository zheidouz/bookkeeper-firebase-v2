// useBookkeepers — list of bookkeeper users for the Select in
// NewClientDialog / EditClientDialog.
//
// Firestore rules (slice #7) now allow bookkeeper+admin to read the
// users collection list, so a client-SDK onSnapshot can populate the
// dropdown. We filter client-side to `role === "bookkeeper"` because
// the index-free query is cheap at small scale.

import { useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { db } from "@/lib/firebaseConfig";

export interface BookkeeperOption {
  id: string;
  name: string | null;
  email: string;
}

export const BOOKKEEPERS_QUERY_KEY = ["bookkeepers"] as const;

export function useBookkeepers() {
  const qc = useQueryClient();

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "users"),
      (snap) => {
        const all = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            name: (data.name as string | null | undefined) ?? null,
            email: (data.email as string | undefined) ?? "",
            role: (data.role as string | undefined) ?? "staff",
            status: (data.status as string | undefined) ?? "active",
          };
        });
        const bookkeepers: BookkeeperOption[] = all
          .filter((u) => u.role === "bookkeeper")
          .map((u) => ({ id: u.id, name: u.name, email: u.email }));
        qc.setQueryData(BOOKKEEPERS_QUERY_KEY, bookkeepers);
      },
      () => {
        // Staff (or a stale token) — leave the cache empty.
      },
    );
    return unsub;
  }, [qc]);

  return useQuery<BookkeeperOption[]>({
    queryKey: BOOKKEEPERS_QUERY_KEY,
    queryFn: () => [],
  });
}
