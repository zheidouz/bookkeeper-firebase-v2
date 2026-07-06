## Parent

Bookkeeper & Tax Filing Dashboard v1 — https://github.com/zheidouz/bookkeeper-firebase-v2/issues/1

## What to build

The pure-function deadline calculator and the BIR holiday table seeding. After this slice, `calculateNextDeadline(formCode, periodEnd, holidays, shift?)` exists, is fully tested, and a config doc with the 2026 + 2027 BIR non-working days is loaded into `config/birHolidays/{year}`. This slice has no UI; it's a library + data-seeding slice that runs in parallel with slices 3/4/5.

Specifically:

- `src/lib/deadline.ts` exporting:
  ```ts
  type Frequency = 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'custom';
  type DeadlineRule =
    | 'lastDayOfMonthAfterPeriod'
    | 'lastWorkingDayOfMonthAfterPeriod'
    | 'lastWorkingDayOfMonthAfterPeriod+1'
    | 'fixedDayOfMonthAfterPeriod' /* + N */;

  function calculateNextDeadline(
    formCode: string,
    rule: DeadlineRule,
    periodEnd: Date,
    holidays: ReadonlySet<string>, // ISO yyyy-mm-dd
    shift?: number,
  ): Date;
  ```
- `src/lib/recurrence.ts` exporting `nextPeriod(prev: {periodStart, periodEnd, frequency}): {periodStart, periodEnd}` for monthly/quarterly/semi_annual/annual; custom returns `null` and forces the UI to collect a manual deadline.
- A seeding Cloud Function `seedBirHolidays` (idempotent) that writes the official Philippine non-working days for 2026 and 2027 to `config/birHolidays/{year}` as `{days: ['2026-01-01', ...]}`. The slice ships a curated list (regular holidays + special non-working days declared by Proclamation).
- Vitest fixture suite per BIR form (focus on the 5 highest-volume forms first per the PRD: 2550Q, 2550M, 1601C, 1701Q, 1701A) covering Q1, Q2, holiday-adjacent (e.g., April 30 = holiday), and leap-year cases.
- No UI changes. The Functions code (`functions/src/lib/`) re-imports these modules via a shared package or via a copy + sync step documented in the slice.

## Acceptance criteria

- [ ] `calculateNextDeadline('2550Q', 'lastWorkingDayOfMonthAfterPeriod+1', new Date('2026-03-31'), holidaysFor2026)` returns `2026-05-04` (May 1 is Labor Day; slides to next working day; +1 puts it on May 4).
- [ ] All 5 high-volume forms pass their Vitest fixtures.
- [ ] `seedBirHolidays` is idempotent — running twice produces the same final state.
- [ ] The `config/birHolidays/2026` and `2027` docs are queryable from the client via the Firestore SDK after running the function once.
- [ ] `nextPeriod` returns `null` for `frequency: 'custom'`.
- [ ] No UI is touched in this slice.

## Blocked by

- Stack scaffold (#2)
