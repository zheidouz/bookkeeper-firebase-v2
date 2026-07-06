// deriveTaskMeta — pure helper that derives the searchable `year` and
// `monthOrQuarter` fields a clientFormTask should carry. Used by
// the attach + edit dialogs to populate the indexed fields and by
// the tests to lock down boundary behaviour.
//
// UTC throughout: callers pass a Date that is already in UTC (the
// deadline calculator also works in UTC), and we read the UTC month.

import type { Frequency } from "@/lib/deadline";

export interface DerivedTaskMeta {
  /** Calendar year of the period start, UTC. */
  year: number;
  /**
   * 1..12 for monthly, 1..4 for quarterly, 1..2 for semi_annual, null
   * for annual and custom. Computed from the UTC month so the result
   * is independent of the bookkeeper's local timezone.
   */
  monthOrQuarter: number | null;
}

export function deriveTaskMeta(
  frequency: Frequency,
  periodStart: Date,
): DerivedTaskMeta {
  const year = periodStart.getUTCFullYear();
  switch (frequency) {
    case "monthly": {
      return { year, monthOrQuarter: periodStart.getUTCMonth() + 1 };
    }
    case "quarterly": {
      // Q1 = Jan..Mar (m=0..2), Q2 = Apr..Jun (m=3..5), etc.
      const m = periodStart.getUTCMonth();
      return { year, monthOrQuarter: Math.floor(m / 3) + 1 };
    }
    case "semi_annual": {
      // H1 = Jan..Jun (m=0..5), H2 = Jul..Dec (m=6..11).
      const m = periodStart.getUTCMonth();
      return { year, monthOrQuarter: m < 6 ? 1 : 2 };
    }
    case "annual":
    case "custom":
      return { year, monthOrQuarter: null };
  }
}
