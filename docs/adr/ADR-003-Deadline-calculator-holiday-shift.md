# ADR-003. Deadline calculator: algorithmic + BIR holiday table

**Status:** Accepted
**Date:** 2026-07-06
**Project:** bookkeeper-firebase-v2

## Context

Philippine BIR deadlines follow patterns ("2550Q is due on the last working day of the month following the quarter") that are *almost* algorithmic but shift around holidays (e.g., if April 30 is a holiday, 2550Q slides to the prior or next working day). Pure algorithmic rules misfire on holidays; a fully explicit lookup table of every (form, year, period) → date is unmaintainable across years. The deadline calculator is on the hot path of every archive, every dashboard load, and every notification, so it must be a pure function and must be unit-testable without Firestore.

## Decision

A pure function `calculateNextDeadline(formCode, periodEnd, holidays): Date` lives in `src/lib/deadline.ts` and is imported by both the client (for "days remaining" badges) and the Cloud Functions (for archive-time computation). The BIR holiday table is stored at `config/birHolidays/{year}` with one doc per non-working day and is read once at calculator invocation (cacheable client-side). The default rule per form lives on the `taxForms` document as `defaultDeadlineRule` (e.g., `"lastWorkingDayOfMonthAfterPeriod+1"`), with an optional `deadlineShift` override for forms whose BIR-published schedule differs.

## Consequences

- The calculator is testable with a frozen `Date.now()` and a fixture holiday array — no time, no Firestore.
- Adding a new holiday year is a one-document write to `config/birHolidays/{year}`; no code change.
- Forms whose BIR-published date genuinely diverges from the algorithmic rule (e.g., declared non-working days in specific cities) need a `taxForms.deadlineShift` override — surfaced in the Tax Forms editor.
- Holiday accuracy is the firm's responsibility to maintain; the calculator does not silently fall back to "no shift" on missing data.
- The rule string format (`"lastWorkingDayOfMonthAfterPeriod+1"`) is internal; if it grows past ~10 cases, replace with a typed enum + per-rule handler.

## Follow-up

Seed `config/birHolidays/{2026,2027}` with the official BIR non-working days before v1 ships. Add a Vitest fixture suite covering each form's Q1, Q2, holiday-adjacent, and leap-year cases.