// MIRRORED FROM src/lib/recurrence.ts — keep in sync.
// See docs/issues/0007-deadline-calculator.md.
//
// Identical body to src/lib/recurrence.ts except the import of Frequency
// (local) and the relative module path.

import type { Frequency } from "./deadline.js";

export interface PeriodInput {
  periodStart: Date;
  periodEnd: Date;
  frequency: Frequency;
}

export interface Period {
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Advance to the next period. Returns `null` for `frequency: 'custom'`.
 *
 * Definition: `periodStart` of the next period is the calendar day
 * immediately after the previous `periodEnd`. `periodEnd` is computed by
 * adding 1/3/6/12 months to `periodStart` and then stepping back one
 * day, so a monthly period starting on the 1st ends on the last day of
 * that month (not the 1st of the following month).
 */
export function nextPeriod(prev: PeriodInput): Period | null {
  if (prev.frequency === "custom") return null;

  const start = new Date(prev.periodEnd);
  start.setUTCDate(start.getUTCDate() + 1);

  const end = new Date(start);
  switch (prev.frequency) {
    case "monthly":
      end.setUTCMonth(end.getUTCMonth() + 1);
      break;
    case "quarterly":
      end.setUTCMonth(end.getUTCMonth() + 3);
      break;
    case "semi_annual":
      end.setUTCMonth(end.getUTCMonth() + 6);
      break;
    case "annual":
      end.setUTCMonth(end.getUTCMonth() + 12);
      break;
    default: {
      const _exhaustive: never = prev.frequency;
      throw new Error(`Unsupported frequency: ${String(_exhaustive)}`);
    }
  }
  end.setUTCDate(end.getUTCDate() - 1);

  return { periodStart: start, periodEnd: end };
}