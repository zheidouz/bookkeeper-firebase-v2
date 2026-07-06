// functions/src/lib/nextTask.ts
//
// Shared builder for "what the next period's task looks like" when a
// Done task is archived. Per ADR-001, the archive callable and the
// (future, slice #10 nightly) reconciliation function must produce an
// identical successor, so the shape lives in one pure function.
//
// Pure: no Firebase imports, no I/O. The caller reads the current
// task + the form's deadline profile + the holiday set from Firestore
// and hands them in; this function returns the field values for the
// successor document (everything except server timestamps and the
// cross-link pointers, which the caller stamps inside its transaction).
//
// All date math is UTC, matching deadline.ts / recurrence.ts.

import type { Frequency, DeadlineRule } from "./deadline.js";
import { calculateNextDeadline } from "./deadline.js";
import { nextPeriod } from "./recurrence.js";

/** The subset of the current task the successor is derived from. */
export interface CurrentTaskInput {
  clientId: string;
  taxFormId: string;
  assignedBookkeeperId: string;
  frequency: Frequency;
  periodStart: Date;
  periodEnd: Date;
}

/** The deadline-shaping fields copied from the attached tax form. */
export interface FormDeadlineProfile {
  formCode: string;
  defaultDeadlineRule: DeadlineRule;
  deadlineShift: number | null;
}

/** Field values for the successor clientFormTasks document. */
export interface NextTaskFields {
  clientId: string;
  taxFormId: string;
  assignedBookkeeperId: string;
  frequency: Frequency;
  periodStart: Date;
  periodEnd: Date;
  deadlineDate: Date;
  status: "pending";
  archived: false;
  year: number;
  monthOrQuarter: number | null;
  notes: string;
}

/**
 * Derive the searchable `year` / `monthOrQuarter` for the successor.
 *
 * Mirrors src/lib/deriveTaskMeta.ts. Kept inline here so the Functions
 * codebase has no dependency on the client `src/` tree (the two
 * tsconfigs cannot import across the boundary).
 */
function deriveMeta(
  frequency: Frequency,
  periodStart: Date,
): { year: number; monthOrQuarter: number | null } {
  const year = periodStart.getUTCFullYear();
  switch (frequency) {
    case "monthly":
      return { year, monthOrQuarter: periodStart.getUTCMonth() + 1 };
    case "quarterly":
      return {
        year,
        monthOrQuarter: Math.floor(periodStart.getUTCMonth() / 3) + 1,
      };
    case "semi_annual":
      return { year, monthOrQuarter: periodStart.getUTCMonth() < 6 ? 1 : 2 };
    case "annual":
    case "custom":
      return { year, monthOrQuarter: null };
  }
}

/**
 * Build the successor task's field values, or `null` when the task's
 * frequency has no deterministic next period (`custom`). Callers must
 * treat `null` as "cannot auto-roll — refuse the archive".
 *
 * @param current  Current task's client/form/frequency/period.
 * @param form     The attached form's deadline rule + shift + code.
 * @param holidays ISO `yyyy-mm-dd` strings marking non-working days.
 */
export function buildNextTask(
  current: CurrentTaskInput,
  form: FormDeadlineProfile,
  holidays: ReadonlySet<string>,
): NextTaskFields | null {
  const period = nextPeriod({
    periodStart: current.periodStart,
    periodEnd: current.periodEnd,
    frequency: current.frequency,
  });
  if (!period) return null;

  const deadlineDate = calculateNextDeadline(
    form.formCode,
    form.defaultDeadlineRule,
    period.periodEnd,
    holidays,
    form.deadlineShift ?? undefined,
  );

  const meta = deriveMeta(current.frequency, period.periodStart);

  return {
    clientId: current.clientId,
    taxFormId: current.taxFormId,
    assignedBookkeeperId: current.assignedBookkeeperId,
    frequency: current.frequency,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    deadlineDate,
    status: "pending",
    archived: false,
    year: meta.year,
    monthOrQuarter: meta.monthOrQuarter,
    notes: "",
  };
}
