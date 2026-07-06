/**
 * Unit tests for the slice #15 /archive pure helpers. The page
 * component (ArchivePage) is exercised in the slice #18 Playwright
 * critical-e2e; this file covers just the math.
 */

import { describe, it, expect } from "vitest";
import {
  applyArchiveFilter,
  computeArchivePage,
  distinctArchivedBy,
  distinctFormCodes,
  distinctYears,
  EMPTY_ARCHIVE_FILTER,
  makeArchiveComparator,
  relativeArchivedTime,
  sortArchive,
  type ArchiveRow,
} from "@/features/archive/archiveReducer";

function mkRow(over: Partial<ArchiveRow> = {}): ArchiveRow {
  return {
    id: over.id ?? Math.random().toString(36).slice(2, 10),
    clientId: over.clientId ?? "c1",
    clientName: over.clientName ?? "Acme Inc.",
    formCode: over.formCode ?? "2550Q",
    formName: over.formName ?? "Quarterly VAT",
    frequency: over.frequency ?? "quarterly",
    periodStart: over.periodStart ?? new Date("2026-01-01T00:00:00Z"),
    periodEnd: over.periodEnd ?? new Date("2026-03-31T23:59:59Z"),
    deadlineDate: over.deadlineDate ?? new Date("2026-04-15T00:00:00Z"),
    year: over.year ?? 2026,
    archivedAt: over.archivedAt ?? new Date("2026-04-30T00:00:00Z"),
    archivedBy: over.archivedBy ?? "uid-1",
    archivedByName: over.archivedByName ?? "Alice",
    status: over.status ?? "archived",
  };
}

describe("applyArchiveFilter", () => {
  const rows: ArchiveRow[] = [
    mkRow({ id: "1", clientName: "Acme", formCode: "2550Q", year: 2026 }),
    mkRow({ id: "2", clientName: "Beta", formCode: "1601C", year: 2026 }),
    mkRow({ id: "3", clientName: "Acme", formCode: "1701A", year: 2025 }),
  ];

  it("empty filter returns all", () => {
    expect(applyArchiveFilter(rows, EMPTY_ARCHIVE_FILTER).length).toBe(3);
  });

  it("search matches case-insensitive across client/formCode/formName", () => {
    const out = applyArchiveFilter(rows, { ...EMPTY_ARCHIVE_FILTER, search: "ACME" });
    expect(out.map((r) => r.id).sort()).toEqual(["1", "3"]);
    const out2 = applyArchiveFilter(rows, {
      ...EMPTY_ARCHIVE_FILTER,
      search: "1701",
    });
    expect(out2.map((r) => r.id)).toEqual(["3"]);
  });

  it("year filter keeps only matching year", () => {
    const out = applyArchiveFilter(rows, { ...EMPTY_ARCHIVE_FILTER, year: 2025 });
    expect(out.map((r) => r.id)).toEqual(["3"]);
  });

  it("formCode filter narrows to matching code", () => {
    const out = applyArchiveFilter(rows, {
      ...EMPTY_ARCHIVE_FILTER,
      formCode: "2550Q",
    });
    expect(out.map((r) => r.id)).toEqual(["1"]);
  });

  it("archivedBy filter narrows by uid", () => {
    const rows2 = [
      mkRow({ id: "1", archivedBy: "uid-1", archivedByName: "Alice" }),
      mkRow({ id: "2", archivedBy: "uid-2", archivedByName: "Bob" }),
    ];
    const out = applyArchiveFilter(rows2, {
      ...EMPTY_ARCHIVE_FILTER,
      archivedByUid: "uid-2",
    });
    expect(out.map((r) => r.id)).toEqual(["2"]);
  });
});

describe("makeArchiveComparator + sortArchive", () => {
  const rows: ArchiveRow[] = [
    mkRow({ id: "a", clientName: "Beta", formCode: "2550Q", year: 2025 }),
    mkRow({ id: "b", clientName: "Alpha", formCode: "1701Q", year: 2026 }),
    mkRow({ id: "c", clientName: "Gamma", formCode: "1601C", year: 2025 }),
  ];

  it("archives-at asc", () => {
    const a = { ...rows[0], archivedAt: new Date("2026-01-01") };
    const b = { ...rows[1], archivedAt: new Date("2026-03-01") };
    const c = { ...rows[2], archivedAt: new Date("2026-02-01") };
    expect(sortArchive([a, b, c], "archivedAt", "asc").map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("client asc", () => {
    expect(sortArchive(rows, "client", "asc").map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("formCode desc", () => {
    // ASC: 1601C, 1701Q, 2550Q → DESC reverses to 2550Q, 1701Q, 1601C
    expect(sortArchive(rows, "formCode", "desc").map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("year desc", () => {
    expect(sortArchive(rows, "year", "desc").map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(sortArchive(rows, "year", "asc").map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("is stable (tiebreak by id)", () => {
    const same = [
      mkRow({ id: "z", archivedAt: new Date("2026-01-01") }),
      mkRow({ id: "a", archivedAt: new Date("2026-01-01") }),
    ];
    expect(makeArchiveComparator("archivedAt", "asc")(same[0], same[1])).toBeGreaterThan(0);
  });
});

describe("computeArchivePage (filter + sort combined)", () => {
  const rows: ArchiveRow[] = [
    mkRow({ id: "1", clientName: "Acme", formCode: "2550Q", year: 2026 }),
    mkRow({ id: "2", clientName: "Acme", formCode: "1601C", year: 2025 }),
    mkRow({ id: "3", clientName: "Beta", formCode: "2550Q", year: 2026 }),
  ];
  it("search + year combine", () => {
    const out = computeArchivePage(
      rows,
      { ...EMPTY_ARCHIVE_FILTER, search: "Acme", year: 2026 },
      "client",
      "asc",
    );
    expect(out.map((r) => r.id)).toEqual(["1"]);
  });
});

describe("facets", () => {
  it("distinctYears returns sorted unique years newest first", () => {
    const years = distinctYears([
      mkRow({ id: "a", year: 2025 }),
      mkRow({ id: "b", year: 2026 }),
      mkRow({ id: "c", year: 2025 }),
    ]);
    expect(years).toEqual([2026, 2025]);
  });

  it("distinctFormCodes returns sorted unique codes", () => {
    const codes = distinctFormCodes([
      mkRow({ formCode: "2550Q" }),
      mkRow({ formCode: "1601C" }),
      mkRow({ formCode: "2550Q" }),
    ]);
    expect(codes).toEqual(["1601C", "2550Q"]);
  });

  it("distinctArchivedBy surfaces uids + names", () => {
    const out = distinctArchivedBy([
      mkRow({ archivedBy: "uid-1", archivedByName: "Alice" }),
      mkRow({ archivedBy: "uid-1", archivedByName: "Alice" }),
      mkRow({ archivedBy: "uid-2", archivedByName: "Bob" }),
      mkRow({ archivedBy: "" }), // empty archivedBy — ignored
    ]);
    expect(out).toEqual([
      { uid: "uid-1", name: "Alice" },
      { uid: "uid-2", name: "Bob" },
    ]);
  });
});

describe("relativeArchivedTime", () => {
  const now = new Date("2026-06-15T00:00:00Z");
  it("returns '3d ago' for 3 days past", () => {
    expect(
      relativeArchivedTime(new Date("2026-06-12T00:00:00Z"), now),
    ).toBe("3d ago");
  });
  it("returns 'in 2h' for future", () => {
    expect(
      relativeArchivedTime(new Date("2026-06-15T02:00:00Z"), now),
    ).toBe("in 2h");
  });
  it("returns '2mo ago' for ~60d", () => {
    expect(
      relativeArchivedTime(new Date("2026-04-15T00:00:00Z"), now),
    ).toBe("2mo ago");
  });
});
