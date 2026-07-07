/**
 * Unit tests for the slice #17 `support_reindex_stats` Zod schema
 * (functions/src/zodSchemas.ts).
 *
 * Mirrors `archiveTaskSchema.test.ts` style. Covers the valid case +
 * every failure mode the callable should reject with
 * `invalid-argument` HttpsError.
 */
import { describe, it, expect } from "vitest";
import { supportReindexStatsSchema } from "../../functions/src/zodSchemas";

describe("supportReindexStatsSchema", () => {
  it("accepts an empty payload (both fields optional)", () => {
    const result = supportReindexStatsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts a payload with valid years", () => {
    const result = supportReindexStatsSchema.safeParse({
      years: [2026, 2027],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.years).toEqual([2026, 2027]);
    }
  });

  it("accepts a payload with a valid ISO-8601 since date", () => {
    const result = supportReindexStatsSchema.safeParse({
      since: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts both fields together", () => {
    const result = supportReindexStatsSchema.safeParse({
      years: [2026],
      since: "2026-12-31T23:59:59.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a year below 2000", () => {
    const result = supportReindexStatsSchema.safeParse({ years: [1999] });
    expect(result.success).toBe(false);
  });

  it("rejects a year above 2100", () => {
    const result = supportReindexStatsSchema.safeParse({ years: [2101] });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer year", () => {
    const result = supportReindexStatsSchema.safeParse({ years: [2026.5] });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed since date", () => {
    const result = supportReindexStatsSchema.safeParse({
      since: "yesterday",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-array years field", () => {
    const result = supportReindexStatsSchema.safeParse({
      years: "2026",
    });
    expect(result.success).toBe(false);
  });
});
