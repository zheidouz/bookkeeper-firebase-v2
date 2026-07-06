// Unit tests for the client-side tax-form Zod schema.

import { describe, it, expect } from "vitest";

import {
  taxFormSchema,
  type TaxFormInput,
} from "@/features/taxForms/taxFormSchema";

const valid: TaxFormInput = {
  formCode: "2550Q",
  formName: "Quarterly VAT Return",
  description: "Quarterly VAT return — percentage tax + output/input tax.",
  category: "VAT",
  defaultFrequency: "quarterly",
  defaultDeadlineRule: "lastWorkingDayOfMonthAfterPeriod+1",
  deadlineShift: null,
  isActive: true,
};

describe("taxFormSchema", () => {
  it("accepts a valid payload", () => {
    const result = taxFormSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects a missing formCode", () => {
    const result = taxFormSchema.safeParse({
      ...valid,
      formCode: undefined,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("formCode");
    }
  });

  it("rejects a malformed category enum value", () => {
    const result = taxFormSchema.safeParse({ ...valid, category: "bogus" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing category", () => {
    const { category: _omit, ...withoutCategory } = valid;
    void _omit;
    const result = taxFormSchema.safeParse(withoutCategory);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("category");
    }
  });

  it("applies the isActive default of true when not supplied", () => {
    const { isActive: _omit, ...rest } = valid;
    void _omit;
    const result = taxFormSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(true);
    }
  });

  it("accepts a numeric deadlineShift", () => {
    const result = taxFormSchema.safeParse({ ...valid, deadlineShift: 15 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deadlineShift).toBe(15);
    }
  });

  it("rejects a non-integer deadlineShift", () => {
    const result = taxFormSchema.safeParse({ ...valid, deadlineShift: 1.5 });
    expect(result.success).toBe(false);
  });

  it("rejects an empty formName", () => {
    const result = taxFormSchema.safeParse({ ...valid, formName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a description longer than 500 chars", () => {
    const result = taxFormSchema.safeParse({
      ...valid,
      description: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });
});
