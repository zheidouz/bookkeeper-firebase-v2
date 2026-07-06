// Unit tests for deriveTaskMeta (slice #8). Locks down the boundary
// behaviour the attach dialog relies on: UTC-based month → monthOrQuarter
// mapping for each frequency, plus the leap-year regression test for
// Feb 29 (which must be 1 for quarterly, 2 for semi_annual H1, etc.).

import { describe, expect, it } from "vitest";

import { deriveTaskMeta } from "@/lib/deriveTaskMeta";

function utc(y: number, mIdx: number, d: number): Date {
  // mIdx is 0-based (Jan = 0), matching JS Date.
  return new Date(Date.UTC(y, mIdx, d));
}

describe("deriveTaskMeta", () => {
  it("monthly: January maps to 1", () => {
    const meta = deriveTaskMeta("monthly", utc(2026, 0, 15));
    expect(meta.year).toBe(2026);
    expect(meta.monthOrQuarter).toBe(1);
  });

  it("monthly: December maps to 12", () => {
    const meta = deriveTaskMeta("monthly", utc(2026, 11, 31));
    expect(meta.year).toBe(2026);
    expect(meta.monthOrQuarter).toBe(12);
  });

  it("monthly: Feb 29 leap year still maps to 2", () => {
    const meta = deriveTaskMeta("monthly", utc(2024, 1, 29));
    expect(meta.year).toBe(2024);
    expect(meta.monthOrQuarter).toBe(2);
  });

  it("quarterly: Q1 covers Jan–Mar", () => {
    for (const d of [1, 15, 31]) {
      const meta = deriveTaskMeta("quarterly", utc(2026, 0, d));
      expect(meta.monthOrQuarter).toBe(1);
    }
    for (const d of [1, 15, 31]) {
      const meta = deriveTaskMeta("quarterly", utc(2026, 1, d));
      expect(meta.monthOrQuarter).toBe(1);
    }
    const march = deriveTaskMeta("quarterly", utc(2026, 2, 31));
    expect(march.monthOrQuarter).toBe(1);
  });

  it("quarterly: Q2 starts in April (m=3)", () => {
    const meta = deriveTaskMeta("quarterly", utc(2026, 3, 1));
    expect(meta.monthOrQuarter).toBe(2);
  });

  it("quarterly: Q3 starts in July (m=6)", () => {
    const meta = deriveTaskMeta("quarterly", utc(2026, 6, 1));
    expect(meta.monthOrQuarter).toBe(3);
  });

  it("quarterly: Q4 starts in October (m=9)", () => {
    const meta = deriveTaskMeta("quarterly", utc(2026, 9, 1));
    expect(meta.monthOrQuarter).toBe(4);
  });

  it("quarterly: December (m=11) is still Q4", () => {
    const meta = deriveTaskMeta("quarterly", utc(2026, 11, 31));
    expect(meta.monthOrQuarter).toBe(4);
  });

  it("semi_annual: Jan–Jun is H1", () => {
    expect(
      deriveTaskMeta("semi_annual", utc(2026, 0, 15)).monthOrQuarter,
    ).toBe(1);
    expect(
      deriveTaskMeta("semi_annual", utc(2026, 5, 30)).monthOrQuarter,
    ).toBe(1);
  });

  it("semi_annual: Jul–Dec is H2", () => {
    expect(
      deriveTaskMeta("semi_annual", utc(2026, 6, 1)).monthOrQuarter,
    ).toBe(2);
    expect(
      deriveTaskMeta("semi_annual", utc(2026, 11, 31)).monthOrQuarter,
    ).toBe(2);
  });

  it("annual: monthOrQuarter is null, year is preserved", () => {
    const meta = deriveTaskMeta("annual", utc(2025, 5, 15));
    expect(meta.year).toBe(2025);
    expect(meta.monthOrQuarter).toBeNull();
  });

  it("custom: monthOrQuarter is null, year is preserved", () => {
    const meta = deriveTaskMeta("custom", utc(2027, 0, 1));
    expect(meta.year).toBe(2027);
    expect(meta.monthOrQuarter).toBeNull();
  });

  it("leap year: Feb 29 quarterly maps to Q1 monthOrQuarter=1", () => {
    const meta = deriveTaskMeta("quarterly", utc(2024, 1, 29));
    expect(meta.year).toBe(2024);
    expect(meta.monthOrQuarter).toBe(1);
  });
});
