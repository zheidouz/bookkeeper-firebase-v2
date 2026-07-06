// mergeSeedForms — pure merge logic for the BIR form seed import.
//
// The "Import/refresh seed" action asks: "given the canonical seed list and
// what's already in Firestore, what writes do I need to make?"
//
// Per-seed decision:
//   - no existing doc with this formCode              → action: 'insert'
//   - existing doc matches seed fields exactly        → action: 'update' (refresh timestamp only)
//   - existing doc has any user-edited field          → action: 'skip' (preserve user data)
//
// The function is intentionally a pure (input → output) transform — no
// Firestore, no Date.now(), no SideEffects. The caller performs writes.

export type TaxFrequency =
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

export type TaxFormCategory =
  | "VAT"
  | "Income Tax"
  | "Percentage Tax"
  | "Withholding"
  | "Registration"
  | "Miscellaneous";

/** Shape of a single seed entry in src/seed/birForms.json. */
export interface TaxFormSeed {
  formCode: string;
  formName: string;
  description: string;
  category: TaxFormCategory;
  defaultFrequency: TaxFrequency;
  defaultDeadlineRule: DeadlineRule;
  deadlineShift: number | null;
  isActive: boolean;
  seedSource: boolean;
}

/**
 * Existing row in `taxForms/{formId}` — a partial view of what may be
 * already there. We only model the fields that drive the merge decision
 * plus the audit timestamps.
 */
export interface ExistingTaxForm {
  formCode: string;
  formName?: string;
  description?: string;
  category?: TaxFormCategory;
  defaultFrequency?: TaxFrequency;
  defaultDeadlineRule?: DeadlineRule;
  deadlineShift?: number | null;
  isActive?: boolean;
  /** Set on rows that were originally inserted via the seed import. */
  seedSource?: boolean;
  createdAt?: unknown;
}

export interface MergeResult {
  formCode: string;
  action: "insert" | "update" | "skip";
  /**
   * The post-merge document body. For "insert" and "update" this is the
   * canonical record to write; for "skip" it's the existing record
   * echoed back unchanged so callers can introspect what was preserved.
   */
  merged: Record<string, unknown>;
  /**
   * For "skip" — the fields the user had edited, listed for diagnostic /
   * toast purposes. Empty for insert/update.
   */
  editedFields?: string[];
}

/**
 * Fields whose values come exclusively from the seed. If an existing row
 * has a value that differs from the seed's value, we treat the row as
 * user-edited and skip the seed for that formCode.
 */
const COMPARED_FIELDS: Array<keyof TaxFormSeed> = [
  "formName",
  "description",
  "category",
  "defaultFrequency",
  "defaultDeadlineRule",
  "deadlineShift",
  "isActive",
];

function fieldsDiffer(
  seed: TaxFormSeed,
  existing: ExistingTaxForm
): { differ: boolean; editedFields: string[] } {
  const editedFields: string[] = [];
  for (const f of COMPARED_FIELDS) {
    const seedVal = seed[f] as unknown;
    const existingVal = existing[f] as unknown;
    // Normalize undefined ↔ null for deadlineShift (treat both as "unset").
    const eq =
      seedVal === existingVal ||
      (seedVal == null && existingVal == null) ||
      (seedVal == null && existingVal === undefined) ||
      (existingVal == null && seedVal === undefined);
    if (!eq) {
      editedFields.push(String(f));
    }
  }
  return { differ: editedFields.length > 0, editedFields };
}

/**
 * Decide insert / update / skip for each seed entry.
 *
 * `now` is an explicit injection point so tests are deterministic. The
 * caller (UI button) should pass the current `Date.now()` or a Firestore
 * serverTimestamp placeholder; tests pass a fixed value.
 */
export function mergeSeedForms(
  seeds: TaxFormSeed[],
  existing: ExistingTaxForm[],
  now: number = Date.now()
): MergeResult[] {
  const existingByCode = new Map<string, ExistingTaxForm>();
  for (const e of existing) {
    if (!e.formCode) continue;
    existingByCode.set(e.formCode, e);
  }

  const results: MergeResult[] = [];

  for (const seed of seeds) {
    if (!seed.formCode) continue;
    const found = existingByCode.get(seed.formCode);

    if (!found) {
      // Brand-new seed → insert.
      const merged: Record<string, unknown> = {
        formCode: seed.formCode,
        formName: seed.formName,
        description: seed.description,
        category: seed.category,
        defaultFrequency: seed.defaultFrequency,
        defaultDeadlineRule: seed.defaultDeadlineRule,
        deadlineShift: seed.deadlineShift,
        isActive: seed.isActive,
        seedSource: true,
        createdAt: now,
        updatedAt: now,
      };
      results.push({ formCode: seed.formCode, action: "insert", merged });
      continue;
    }

    // Already exists. Compare fields; if any user-editable field differs,
    // skip to preserve the user's manual edit.
    const { differ, editedFields } = fieldsDiffer(seed, found);

    if (differ) {
      // Echo back existing fields untouched.
      const merged: Record<string, unknown> = { ...found };
      results.push({
        formCode: seed.formCode,
        action: "skip",
        merged,
        editedFields,
      });
      continue;
    }

    // Existing row still matches the seed verbatim. Refresh timestamps.
    const createdAt = found.createdAt ?? now;
    const merged: Record<string, unknown> = {
      formCode: seed.formCode,
      formName: seed.formName,
      description: seed.description,
      category: seed.category,
      defaultFrequency: seed.defaultFrequency,
      defaultDeadlineRule: seed.defaultDeadlineRule,
      deadlineShift: seed.deadlineShift,
      isActive: seed.isActive,
      seedSource: true,
      createdAt,
      updatedAt: now,
    };
    results.push({ formCode: seed.formCode, action: "update", merged });
  }

  return results;
}

/**
 * Convenient summary helper used by the import button's toast.
 * Pure — easy to test.
 */
export function summarizeMerge(results: MergeResult[]): {
  inserted: number;
  updated: number;
  skipped: number;
  skippedCodes: string[];
} {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const skippedCodes: string[] = [];
  for (const r of results) {
    if (r.action === "insert") inserted++;
    else if (r.action === "update") updated++;
    else {
      skipped++;
      skippedCodes.push(r.formCode);
    }
  }
  return { inserted, updated, skipped, skippedCodes };
}
