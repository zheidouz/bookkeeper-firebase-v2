// tests/unit/recurrence.test.ts
//
// Unit tests for src/lib/recurrence.ts.
//
// Coverage:
//   - monthly, quarterly, semi_annual, annual transitions
//   - leap-year (Feb 29 start)
//   - custom returns null

import { describe, it, expect } from "vitest";

import { nextPeriod } from "@/lib/recurrence";
import type { Frequency } from "@/lib/deadline";
import { isoDate } from "@/lib/deadline";

function isoOf(d: Date | null | undefined): string | null {
  return d ? isoDate(d) : null;
}

function next(args: {
  start: string;
  end: string;
  freq: Frequency;
}): { start: string; end: string } | null {
  const r = nextPeriod({
    periodStart: new Date(args.start),
    periodEnd: new Date(args.end),
    frequency: args.freq,
  });
  return r ? { start: isoDate(r.periodStart), end: isoDate(r.periodEnd) } : null;
}

describe("nextPeriod — frequency transitions", () => {
  it("monthly: Jan → Feb (start=2026-01-01, end=2026-01-31 → start=2026-02-01, end=2026-02-28)", () => {
    expect(
      next({ start: "2026-01-01", end: "2026-01-31", freq: "monthly" }),
    ).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });

  it("quarterly: Q1 → Q2 (end=2026-03-31 → start=2026-04-01, end=2026-06-30)", () => {
    expect(
      next({ start: "2026-01-01", end: "2026-03-31", freq: "quarterly" }),
    ).toEqual({ start: "2026-04-01", end: "2026-06-30" });
  });

  it("semi_annual: H1 → H2 (end=2026-06-30 → start=2026-07-01, end=2026-12-31)", () => {
    expect(
      next({ start: "2026-01-01", end: "2026-06-30", freq: "semi_annual" }),
    ).toEqual({ start: "2026-07-01", end: "2026-12-31" });
  });

  it("annual: 2025 → 2026 (end=2025-12-31 → start=2026-01-01, end=2026-12-31)", () => {
    expect(
      next({ start: "2025-01-01", end: "2025-12-31", freq: "annual" }),
    ).toEqual({ start: "2026-01-01", end: "2026-12-31" });
  });

  it("leap year: monthly Feb 2024 (end=2024-02-29 → start=2024-03-01, end=2024-03-31)", () => {
    expect(
      next({ start: "2024-02-01", end: "2024-02-29", freq: "monthly" }),
    ).toEqual({ start: "2024-03-01", end: "2024-03-31" });
  });

  it("custom returns null regardless of inputs", () => {
    expect(
      next({ start: "2026-01-01", end: "2026-01-31", freq: "custom" }),
    ).toBeNull();
  });

  it("quarterly crossing a year boundary (Q4 2025 → Q1 2026)", () => {
    expect(
      next({ start: "2025-10-01", end: "2025-12-31", freq: "quarterly" }),
    ).toEqual({ start: "2026-01-01", end: "2026-03-31" });
  });

  it("monthly with non-1st start (start=2026-01-15 → next start=2026-02-15, end=2026-03-14)", () => {
    // periodStart = Jan 15, periodEnd = Feb 14. Next start = Feb 15, next end = Mar 14.
    expect(
      next({ start: "2026-01-15", end: "2026-02-14", freq: "monthly" }),
    ).toEqual({ start: "2026-02-15", end: "2026-03-14" });
  });
});

// Silences the unused-import warning when this file is the only consumer.
void isoOf;