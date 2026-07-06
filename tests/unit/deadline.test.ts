// tests/unit/deadline.test.ts
//
// Unit tests for src/lib/deadline.ts.
//
// Coverage:
//   - 2550Q Q1, Q2 deadlines
//   - 2550M monthly deadline
//   - 1601C, 1701Q, 1701A deadlines
//   - Leap-year edge case (Feb 29)
//   - Holiday slide backward (lastWorkingDayOfMonthAfterPeriod)
//   - Holiday slide forward (+1 variant) — the spec's headline acceptance case
//   - Holiday spread across a weekend
//   - fixedDayOfMonthAfterPeriod with shift=15

import { describe, it, expect } from "vitest";

import {
  calculateNextDeadline,
  isWorkingDay,
  isoDate,
  type DeadlineRule,
} from "@/lib/deadline";

// Curated 2026 PH regular holidays (subset, used for slide tests). Each
// entry is ISO `yyyy-mm-dd` (UTC).
const holidays2026 = new Set<string>([
  "2026-01-01", // New Year's Day
  "2026-04-02", // Maundy Thursday
  "2026-04-03", // Good Friday
  "2026-04-09", // Araw ng Kagitingan
  "2026-05-01", // Labor Day
  "2026-06-12", // Independence Day
  "2026-08-31", // National Heroes Day
  "2026-11-30", // Bonifacio Day
  "2026-12-25", // Christmas
  "2026-12-30", // Rizal Day
  "2026-12-31", // Last day of year
]);

// 2024 is a leap year — used to exercise Feb 29.
const holidays2024 = new Set<string>([
  "2024-01-01",
  "2024-03-28", // Holy Thursday
  "2024-03-29", // Good Friday
  "2024-04-09",
  "2024-05-01",
]);

function expectDeadline(
  formCode: string,
  rule: DeadlineRule,
  periodEnd: string,
  holidays: ReadonlySet<string>,
  expected: string,
  shift?: number,
): void {
  const result = calculateNextDeadline(
    formCode,
    rule,
    new Date(periodEnd),
    holidays,
    shift,
  );
  expect(isoDate(result)).toBe(expected);
}

describe("calculateNextDeadline — BIR forms", () => {
  it("2550Q Q1: periodEnd=2026-03-31 → last day of April 2026 (2026-04-30)", () => {
    expectDeadline(
      "2550Q",
      "lastDayOfMonthAfterPeriod",
      "2026-03-31",
      holidays2026,
      "2026-04-30",
    );
  });

  it("2550Q Q2: periodEnd=2026-06-30 → 2026-07-31 (no holidays near)", () => {
    expectDeadline(
      "2550Q",
      "lastDayOfMonthAfterPeriod",
      "2026-06-30",
      holidays2026,
      "2026-07-31",
    );
  });

  it("2550Q: Apr 30 = holiday, slide BACKWARD to last working day of April (2026-04-29)", () => {
    const h = new Set([...holidays2026, "2026-04-30"]);
    expectDeadline(
      "2550Q",
      "lastWorkingDayOfMonthAfterPeriod",
      "2026-03-31",
      h,
      "2026-04-29",
    );
  });

  it("HEADLINE ACCEPTANCE — 2550Q: May 1 = Labor Day, slide FORWARD +1 to 2026-05-04", () => {
    expectDeadline(
      "2550Q",
      "lastWorkingDayOfMonthAfterPeriod+1",
      "2026-03-31",
      holidays2026,
      "2026-05-04",
    );
  });

  it("2550M (monthly) Apr period → 2026-05-15 under fixedDayOfMonthAfterPeriod shift=15", () => {
    expectDeadline(
      "2550M",
      "fixedDayOfMonthAfterPeriod",
      "2026-04-30",
      holidays2026,
      "2026-05-15",
      15,
    );
  });

  it("2550M: periodEnd=2026-03-31, fixedDay=15 → 2026-04-15 (April 15 is a working day)", () => {
    expectDeadline(
      "2550M",
      "fixedDayOfMonthAfterPeriod",
      "2026-03-31",
      holidays2026,
      "2026-04-15",
      15,
    );
  });

  it("1601C monthly: periodEnd=2026-01-31 → 2026-02-10 (fixedDay=10, slide if needed)", () => {
    expectDeadline(
      "1601C",
      "fixedDayOfMonthAfterPeriod",
      "2026-01-31",
      holidays2026,
      "2026-02-10",
      10,
    );
  });

  it("1701Q Q1: periodEnd=2026-03-31 → 2026-04-30 (lastDay variant)", () => {
    expectDeadline(
      "1701Q",
      "lastDayOfMonthAfterPeriod",
      "2026-03-31",
      holidays2026,
      "2026-04-30",
    );
  });

  it("1701A annual (lastDay variant, no slide): periodEnd=2025-12-31 → 2026-01-31", () => {
    // Note: real BIR 1701A has a 4-month deadline window; in production
    // the rule is `fixedDayOfMonthAfterPeriod` with shift=15 applied to
    // a synthesized periodEnd 4 months ahead. Here we just exercise the
    // pure-function shape: a year-end period → January-end deadline.
    expectDeadline(
      "1701A",
      "lastDayOfMonthAfterPeriod",
      "2025-12-31",
      holidays2026,
      "2026-01-31",
    );
  });

  it("leap year: periodEnd=2024-02-29 → 2024-03-31 (lastDay variant)", () => {
    expectDeadline(
      "2550M",
      "lastDayOfMonthAfterPeriod",
      "2024-02-29",
      holidays2024,
      "2024-03-31",
    );
  });

  it("leap year + fixedDay=29: periodEnd=2024-01-31 → 2024-02-29 (working day)", () => {
    expectDeadline(
      "2550M",
      "fixedDayOfMonthAfterPeriod",
      "2024-01-31",
      holidays2024,
      "2024-02-29",
      29,
    );
  });

  it("backward slide lands on Friday when base = Saturday", () => {
    // 2026-04-30 is a Thursday, but mark it a holiday AND make 04-29 a
    // holiday too. Expect slide to 2026-04-28 (Tuesday).
    const h = new Set([...holidays2026, "2026-04-30", "2026-04-29"]);
    expectDeadline(
      "2550Q",
      "lastWorkingDayOfMonthAfterPeriod",
      "2026-03-31",
      h,
      "2026-04-28",
    );
  });

  it("forward slide lands past a weekend sandwich", () => {
    // Mark Friday 2026-05-01 (Labor Day), Saturday 2026-05-02 (already
    // weekend), Sunday 2026-05-03 (weekend), and Monday 2026-05-04 also
    // a holiday. Expected slide lands on 2026-05-05 (Tuesday).
    const h = new Set([
      ...holidays2026,
      "2026-05-04", // extra holiday Monday
    ]);
    expectDeadline(
      "2550Q",
      "lastWorkingDayOfMonthAfterPeriod+1",
      "2026-03-31",
      h,
      "2026-05-05",
    );
  });

  it("fixedDayOfMonthAfterPeriod: shift=15 on periodEnd=2026-12-31 → 2027-01-15", () => {
    expectDeadline(
      "2550M",
      "fixedDayOfMonthAfterPeriod",
      "2026-12-31",
      holidays2026,
      "2027-01-15",
      15,
    );
  });

  it("fixedDayOfMonthAfterPeriod: shift=15 on a base that IS a holiday slides forward", () => {
    // 2026-04-15 (Wednesday) — pretend it is a holiday. Slide forward to
    // 2026-04-16.
    const h = new Set([...holidays2026, "2026-04-15"]);
    expectDeadline(
      "2550M",
      "fixedDayOfMonthAfterPeriod",
      "2026-03-31",
      h,
      "2026-04-16",
      15,
    );
  });

  it("fixedDayOfMonthAfterPeriod throws when shift is missing", () => {
    expect(() =>
      calculateNextDeadline(
        "2550M",
        "fixedDayOfMonthAfterPeriod",
        new Date("2026-03-31"),
        holidays2026,
      ),
    ).toThrow(/shift/);
  });

  it("fixedDayOfMonthAfterPeriod throws when shift is out of range", () => {
    expect(() =>
      calculateNextDeadline(
        "2550M",
        "fixedDayOfMonthAfterPeriod",
        new Date("2026-03-31"),
        holidays2026,
        0,
      ),
    ).toThrow(/1\.\.31/);
  });
});

describe("isWorkingDay — sanity", () => {
  it("returns false for Saturday", () => {
    // 2026-04-04 is a Saturday.
    expect(isWorkingDay(new Date("2026-04-04"), holidays2026)).toBe(false);
  });

  it("returns false for Sunday", () => {
    // 2026-04-05 is a Sunday.
    expect(isWorkingDay(new Date("2026-04-05"), holidays2026)).toBe(false);
  });

  it("returns false for a weekday listed in holidays", () => {
    // 2026-05-01 is a Friday Labor Day.
    expect(isWorkingDay(new Date("2026-05-01"), holidays2026)).toBe(false);
  });

  it("returns true for a normal weekday", () => {
    // 2026-04-06 is a Monday with no holiday.
    expect(isWorkingDay(new Date("2026-04-06"), holidays2026)).toBe(true);
  });
});