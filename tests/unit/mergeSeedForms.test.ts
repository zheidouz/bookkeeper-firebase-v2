// Unit tests for the pure mergeSeedForms function (no Firestore, no
// React). Covers the no-clobber contract that the whole slice depends on.

import { describe, it, expect } from "vitest";

import {
  mergeSeedForms,
  summarizeMerge,
  type TaxFormSeed,
  type ExistingTaxForm,
} from "@/lib/mergeSeedForms";

const NOW = 1_700_000_000_000;

function seed(partial: Partial<TaxFormSeed> = {}): TaxFormSeed {
  return {
    formCode: "2550Q",
    formName: "Quarterly Value-Added Tax Return",
    description: "Quarterly VAT return.",
    category: "VAT",
    defaultFrequency: "quarterly",
    defaultDeadlineRule: "lastWorkingDayOfMonthAfterPeriod+1",
    deadlineShift: null,
    isActive: true,
    seedSource: true,
    ...partial,
  };
}

describe("mergeSeedForms — pure merge logic", () => {
  it("brand-new seed with no existing row → 'insert' with seed fields", () => {
    const seeds: TaxFormSeed[] = [seed()];
    const results = mergeSeedForms(seeds, [], NOW);

    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.action).toBe("insert");
    expect(r.formCode).toBe("2550Q");
    expect(r.merged.formCode).toBe("2550Q");
    expect(r.merged.formName).toBe("Quarterly Value-Added Tax Return");
    expect(r.merged.category).toBe("VAT");
    expect(r.merged.seedSource).toBe(true);
    expect(r.merged.createdAt).toBe(NOW);
    expect(r.merged.updatedAt).toBe(NOW);
    expect(r.merged.isActive).toBe(true);
  });

  it("existing row identical to seed → 'update' with preserved createdAt + new updatedAt", () => {
    const seeds: TaxFormSeed[] = [seed()];
    const existing: ExistingTaxForm[] = [
      {
        formCode: "2550Q",
        formName: "Quarterly Value-Added Tax Return",
        description: "Quarterly VAT return.",
        category: "VAT",
        defaultFrequency: "quarterly",
        defaultDeadlineRule: "lastWorkingDayOfMonthAfterPeriod+1",
        deadlineShift: null,
        isActive: true,
        seedSource: true,
        createdAt: NOW - 10_000,
      },
    ];

    const results = mergeSeedForms(seeds, existing, NOW);
    const r = results[0];
    expect(r.action).toBe("update");
    expect(r.merged.createdAt).toBe(NOW - 10_000);
    expect(r.merged.updatedAt).toBe(NOW);
    expect(r.merged.seedSource).toBe(true);
  });

  it("existing row with user-edited description → 'skip'", () => {
    const seeds: TaxFormSeed[] = [seed()];
    const existing: ExistingTaxForm[] = [
      {
        formCode: "2550Q",
        formName: "Quarterly Value-Added Tax Return",
        description: "User rewrote this description.",
        category: "VAT",
        defaultFrequency: "quarterly",
        defaultDeadlineRule: "lastWorkingDayOfMonthAfterPeriod+1",
        deadlineShift: null,
        isActive: true,
        seedSource: true,
      },
    ];

    const results = mergeSeedForms(seeds, existing, NOW);
    const r = results[0];
    expect(r.action).toBe("skip");
    expect(r.editedFields).toContain("description");
    expect((r.merged as { description: string }).description).toBe(
      "User rewrote this description.",
    );
  });

  it("existing row with user-edited deadlineShift → 'skip'", () => {
    const seeds: TaxFormSeed[] = [seed({ deadlineShift: null })];
    const existing: ExistingTaxForm[] = [
      {
        formCode: "2550Q",
        formName: "Quarterly Value-Added Tax Return",
        description: "Quarterly VAT return.",
        category: "VAT",
        defaultFrequency: "quarterly",
        defaultDeadlineRule: "lastWorkingDayOfMonthAfterPeriod+1",
        deadlineShift: 7,
        isActive: true,
        seedSource: true,
      },
    ];

    const results = mergeSeedForms(seeds, existing, NOW);
    const r = results[0];
    expect(r.action).toBe("skip");
    expect(r.editedFields).toContain("deadlineShift");
  });

  it("empty seed list → no-op results", () => {
    const results = mergeSeedForms([], [{ formCode: "2550Q" }], NOW);
    expect(results).toEqual([]);
  });

  it("empty existing list → all seeds 'insert'", () => {
    const seeds: TaxFormSeed[] = [
      seed({ formCode: "A" }),
      seed({ formCode: "B" }),
    ];
    const results = mergeSeedForms(seeds, [], NOW);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.action === "insert")).toBe(true);
  });

  it("existing row matches seed except for seedSource flag → still 'update'", () => {
    // A seeded row that lost its seedSource flag (e.g. accidental admin edit)
    // should still be eligible for refresh IF no other fields differ.
    const seeds: TaxFormSeed[] = [seed()];
    const existing: ExistingTaxForm[] = [
      {
        formCode: "2550Q",
        formName: "Quarterly Value-Added Tax Return",
        description: "Quarterly VAT return.",
        category: "VAT",
        defaultFrequency: "quarterly",
        defaultDeadlineRule: "lastWorkingDayOfMonthAfterPeriod+1",
        deadlineShift: null,
        isActive: true,
        seedSource: false,
      },
    ];

    const results = mergeSeedForms(seeds, existing, NOW);
    expect(results[0].action).toBe("update");
    expect((results[0].merged as { seedSource: boolean }).seedSource).toBe(
      true,
    );
  });

  it("multiple seeds produce one result per seed (order-stable)", () => {
    const seeds: TaxFormSeed[] = [
      seed({ formCode: "A" }),
      seed({ formCode: "B" }),
      seed({ formCode: "C" }),
    ];
    const results = mergeSeedForms(seeds, [], NOW);
    expect(results.map((r) => r.formCode)).toEqual(["A", "B", "C"]);
  });
});

describe("summarizeMerge", () => {
  it("counts actions and lists skipped codes", () => {
    const summary = summarizeMerge([
      { formCode: "A", action: "insert", merged: {} },
      { formCode: "B", action: "insert", merged: {} },
      { formCode: "C", action: "update", merged: {} },
      { formCode: "D", action: "skip", merged: {} },
      { formCode: "E", action: "skip", merged: {} },
    ]);

    expect(summary.inserted).toBe(2);
    expect(summary.updated).toBe(1);
    expect(summary.skipped).toBe(2);
    expect(summary.skippedCodes).toEqual(["D", "E"]);
  });
});
