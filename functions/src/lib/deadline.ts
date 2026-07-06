// MIRRORED FROM src/lib/deadline.ts — keep in sync.
// See docs/issues/0007-deadline-calculator.md.
//
// Identical body to src/lib/deadline.ts except the import of Frequency
// (local) and the relative module path used by recurrence (also mirrored).

export type Frequency =
  | "monthly"
  | "quarterly"
  | "semi_annual"
  | "annual"
  | "custom";

export type DeadlineRule =
  | "lastDayOfMonthAfterPeriod"
  | "lastWorkingDayOfMonthAfterPeriod"
  | "lastWorkingDayOfMonthAfterPeriod+1"
  | "fixedDayOfMonthAfterPeriod";

/** Maximum number of days we will slide in either direction before giving up. */
const MAX_SLIDE_DAYS = 14;

/**
 * Returns true iff `d` is a Mon-Fri that is not in the `holidays` set.
 *
 * `holidays` is a Set of ISO `yyyy-mm-dd` strings (e.g. "2026-05-01").
 *
 * Uses UTC — `getUTCDay()` returns 0 for Sunday and 6 for Saturday.
 */
export function isWorkingDay(d: Date, holidays: ReadonlySet<string>): boolean {
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  const iso = d.toISOString().slice(0, 10);
  return !holidays.has(iso);
}

/** Returns the ISO `yyyy-mm-dd` representation of the UTC date. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Returns the last calendar day of the UTC month immediately after
 * `periodEnd`'s month. For `periodEnd = 2026-03-31` (UTC month index 2)
 * this returns `2026-04-30`.
 *
 * Implementation: `Date.UTC(y, m, 0)` returns the last day of month m.
 * To get the last day of "the month after periodEnd's month" we ask for
 * `Date.UTC(y, month+2, 0)` — i.e. the day-before-the-first of the
 * month two steps ahead, which is the last day of the intermediate
 * month.
 */
function lastDayOfMonthAfter(periodEnd: Date): Date {
  return new Date(
    Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() + 2, 0),
  );
}

/**
 * Walk day-by-day from `seed` in `direction` until we find a working
 * day, or we hit the slide cap. Returns the original `seed` if it is
 * already a working day.
 *
 * `direction` must be `1` (forward) or `-1` (backward).
 *
 * Note: this helper performs no minimum offset — the caller decides
 * whether to start from the base day itself (the "lastWorkingDay" rules
 * may return the base if it is already a working day) or one day past
 * it (the `+1` rule advances at minimum one calendar day). See the
 * caller for the explicit `startOffset` argument.
 */
function slideToWorkingDay(
  seed: Date,
  direction: 1 | -1,
  startOffset: number,
  holidays: ReadonlySet<string>,
): Date {
  const cur = new Date(seed);
  if (startOffset !== 0) {
    cur.setUTCDate(cur.getUTCDate() + startOffset);
  }
  if (isWorkingDay(cur, holidays)) return cur;
  for (let i = 0; i < MAX_SLIDE_DAYS; i++) {
    cur.setUTCDate(cur.getUTCDate() + direction);
    if (isWorkingDay(cur, holidays)) return cur;
  }
  return cur;
}

/**
 * Calculate the next filing deadline for a BIR form.
 *
 * @param formCode   BIR form code, e.g. "2550Q". Accepted but currently
 *                   ignored — present so future per-form overrides can
 *                   be threaded through without breaking callers.
 * @param rule       How to derive the deadline from `periodEnd`.
 * @param periodEnd  The last day of the reporting period.
 * @param holidays   ISO `yyyy-mm-dd` strings marking non-working days.
 * @param shift      Day-of-month for `fixedDayOfMonthAfterPeriod`.
 *                   Required for that rule; ignored otherwise.
 */
export function calculateNextDeadline(
  formCode: string,
  rule: DeadlineRule,
  periodEnd: Date,
  holidays: ReadonlySet<string>,
  shift?: number,
): Date {
  void formCode;

  switch (rule) {
    case "lastDayOfMonthAfterPeriod": {
      return lastDayOfMonthAfter(periodEnd);
    }
    case "lastWorkingDayOfMonthAfterPeriod": {
      const base = lastDayOfMonthAfter(periodEnd);
      return slideToWorkingDay(base, -1, 0, holidays);
    }
    case "lastWorkingDayOfMonthAfterPeriod+1": {
      const base = lastDayOfMonthAfter(periodEnd);
      return slideToWorkingDay(base, 1, 1, holidays);
    }
    case "fixedDayOfMonthAfterPeriod": {
      if (typeof shift !== "number" || !Number.isFinite(shift)) {
        throw new Error(
          "fixedDayOfMonthAfterPeriod requires a numeric `shift` argument (1..31).",
        );
      }
      const day = Math.trunc(shift);
      if (day < 1 || day > 31) {
        throw new Error(
          `fixedDayOfMonthAfterPeriod: shift must be 1..31, received ${day}.`,
        );
      }
      const base = new Date(
        Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() + 1, day),
      );
      return slideToWorkingDay(base, 1, 0, holidays);
    }
    default: {
      const _exhaustive: never = rule;
      throw new Error(`Unsupported DeadlineRule: ${String(_exhaustive)}`);
    }
  }
}