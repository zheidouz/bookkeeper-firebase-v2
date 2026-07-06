// useHolidays — slice #10. Loads the BIR holiday sets for the given
// years from the top-level `birHolidays/{year}` collection (seeded by
// the slice #4 seedBirHolidays callable) and returns a merged
// `Set<string>` of ISO yyyy-mm-dd non-working days.
//
// Used by ArchiveTaskDialog to compute the SAME next-period deadline
// the archiveTask callable will compute, so the confirmation dialog
// shows the real deadline before committing. The callable is the
// source of truth; this is a client-side preview that reads the same
// seed data.

import { useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { db } from "@/lib/firebaseConfig";

export const holidaysQueryKey = (years: number[]) =>
  ["birHolidays", [...years].sort((a, b) => a - b).join(",")] as const;

async function loadYear(year: number): Promise<string[]> {
  try {
    const snap = await getDoc(doc(db, "birHolidays", String(year)));
    if (!snap.exists()) return [];
    const days = snap.get("days");
    return Array.isArray(days)
      ? days.filter((d): d is string => typeof d === "string")
      : [];
  } catch {
    // A signed-in user without read access, or an offline read — treat
    // as "no holidays", which is a safe fallback for the preview (the
    // callable recomputes authoritatively server-side).
    return [];
  }
}

/**
 * Returns a merged holiday Set for the requested years. An empty
 * `years` array short-circuits to an empty set without a read.
 */
export function useHolidays(years: number[]) {
  const qc = useQueryClient();
  const key = holidaysQueryKey(years);

  useEffect(() => {
    if (years.length === 0) {
      qc.setQueryData(key, new Set<string>());
      return;
    }
    let cancelled = false;
    void (async () => {
      const perYear = await Promise.all(years.map(loadYear));
      if (cancelled) return;
      const merged = new Set<string>();
      perYear.forEach((days) => days.forEach((d) => merged.add(d)));
      qc.setQueryData(key, merged);
    })();
    return () => {
      cancelled = true;
    };
    // key already encodes the year list; stringify to keep the dep
    // array primitive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key.join("|")]);

  return useQuery<Set<string>>({
    queryKey: key,
    queryFn: () => new Set<string>(),
    initialData: () => new Set<string>(),
  });
}
