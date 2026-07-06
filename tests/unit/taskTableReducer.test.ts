/**
 * Unit tests for the slice #13 task table reducers.
 *
 * Pure-function tests — no firebase, no React, no emulator.
 */

import { describe, it, expect } from "vitest";
import {
  applyTableFilters,
  applyTableSearch,
  computeLegalActions,
  computeTablePage,
  EMPTY_TABLE_FILTER,
  isOverdue,
  makeComparator,
  paginate,
  sortTasks,
  type TableTask,
} from "@/features/tasks/taskTableReducer";

const NOW = new Date("2026-04-15T00:00:00Z");

function mkTask(over: Partial<TableTask> = {}): TableTask {
  return {
    id: over.id ?? Math.random().toString(36).slice(2, 10),
    clientName: over.clientName ?? "Acme Inc.",
    formCode: over.formCode ?? "2550Q",
    formName: over.formName ?? "Quarterly VAT",
    frequency: over.frequency ?? "quarterly",
    periodStart: over.periodStart ?? new Date("2026-01-01T00:00:00Z"),
    deadlineDate:
      over.deadlineDate ?? new Date("2026-04-30T00:00:00Z"),
    assignedBookkeeperId: over.assignedBookkeeperId ?? "bk-1",
    status: over.status ?? "pending",
    archived: over.archived ?? false,
    bookkeeperName: over.bookkeeperName ?? "Alice",
  };
}

describe("isOverdue", () => {
  it("pending + past deadline = overdue", () => {
    expect(
      isOverdue(
        { status: "pending", deadlineDate: new Date("2026-04-10T00:00:00Z") },
        NOW,
      ),
    ).toBe(true);
  });
  it("done + past deadline = NOT overdue (terminal status)", () => {
    expect(
      isOverdue(
        { status: "done", deadlineDate: new Date("2026-04-10T00:00:00Z") },
        NOW,
      ),
    ).toBe(false);
  });
  it("archived + past deadline = NOT overdue", () => {
    expect(
      isOverdue(
        { status: "archived", deadlineDate: new Date("2026-04-10T00:00:00Z") },
        NOW,
      ),
    ).toBe(false);
  });
  it("pending + future deadline = NOT overdue", () => {
    expect(
      isOverdue(
        { status: "pending", deadlineDate: new Date("2026-05-30T00:00:00Z") },
        NOW,
      ),
    ).toBe(false);
  });
});

describe("applyTableFilters", () => {
  const tasks: TableTask[] = [
    mkTask({ id: "1", clientName: "Acme Inc.", formCode: "2550Q", status: "pending" }),
    mkTask({ id: "2", clientName: "Acme Inc.", formCode: "1601C", status: "done" }),
    mkTask({ id: "3", clientName: "Beta Corp", formCode: "2550Q", status: "ready_to_file" }),
    mkTask({ id: "4", clientName: "Beta Corp", formCode: "1701Q", status: "submitted" }),
  ];

  it("empty filter returns all", () => {
    expect(applyTableFilters(tasks, EMPTY_TABLE_FILTER).length).toBe(4);
  });
  it("filter by clientId keeps only matching", () => {
    const out = applyTableFilters(tasks, { ...EMPTY_TABLE_FILTER, clientId: "Acme Inc." });
    expect(out.map((t) => t.id).sort()).toEqual(["1", "2"]);
  });
  it("filter by taxFormId keeps only matching", () => {
    const out = applyTableFilters(tasks, { ...EMPTY_TABLE_FILTER, taxFormId: "2550Q" });
    expect(out.map((t) => t.id).sort()).toEqual(["1", "3"]);
  });
  it("filter by status keeps only matching", () => {
    const out = applyTableFilters(tasks, { ...EMPTY_TABLE_FILTER, status: "done" });
    expect(out.map((t) => t.id)).toEqual(["2"]);
  });
  it("overdueOnly keeps only overdue", () => {
    const tasks2: TableTask[] = [
      mkTask({ id: "1", status: "pending", deadlineDate: new Date("2026-04-10T00:00:00Z") }),
      mkTask({ id: "2", status: "pending", deadlineDate: new Date("2026-05-30T00:00:00Z") }),
    ];
    const out = applyTableFilters(
      tasks2,
      { ...EMPTY_TABLE_FILTER, overdueOnly: true },
      NOW,
    );
    expect(out.map((t) => t.id)).toEqual(["1"]);
  });
  it("combined filters are AND-ed", () => {
    const out = applyTableFilters(tasks, {
      clientId: "Acme Inc.",
      taxFormId: "all",
      status: "pending",
      overdueOnly: false,
    });
    expect(out.map((t) => t.id)).toEqual(["1"]);
  });
});

describe("applyTableSearch", () => {
  const tasks: TableTask[] = [
    mkTask({ id: "1", clientName: "Acme Inc." }),
    mkTask({ id: "2", clientName: "Beta Corp" }),
    mkTask({ id: "3", clientName: "Gamma LLC", formCode: "1601C" }),
  ];

  it("empty query returns all", () => {
    expect(applyTableSearch(tasks, "").length).toBe(3);
  });
  it("matches clientName case-insensitive", () => {
    expect(applyTableSearch(tasks, "ACME").map((t) => t.id)).toEqual(["1"]);
  });
  it("matches formCode", () => {
    expect(applyTableSearch(tasks, "1601C").map((t) => t.id)).toEqual(["3"]);
  });
  it("matches formName", () => {
    expect(
      applyTableSearch(
        [mkTask({ id: "1", formName: "Quarterly VAT Return" })],
        "quarterly",
      ).map((t) => t.id),
    ).toEqual(["1"]);
  });
  it("whitespace-only returns all", () => {
    expect(applyTableSearch(tasks, "   ").length).toBe(3);
  });
});

describe("sortTasks", () => {
  const tasks: TableTask[] = [
    mkTask({
      id: "a",
      clientName: "Beta",
      formCode: "2550Q",
      deadlineDate: new Date("2026-06-01T00:00:00Z"),
    }),
    mkTask({
      id: "b",
      clientName: "Alpha",
      formCode: "1701Q",
      deadlineDate: new Date("2026-05-01T00:00:00Z"),
    }),
    mkTask({
      id: "c",
      clientName: "Gamma",
      formCode: "1601C",
      deadlineDate: new Date("2026-04-01T00:00:00Z"),
    }),
  ];

  it("sorts by deadline asc", () => {
    expect(sortTasks(tasks, "deadline", "asc").map((t) => t.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });
  it("sorts by deadline desc", () => {
    expect(sortTasks(tasks, "deadline", "desc").map((t) => t.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
  it("sorts by client name asc", () => {
    expect(sortTasks(tasks, "client", "asc").map((t) => t.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });
  it("sorts by formCode desc", () => {
    // ASC: 1601C, 1701Q, 2550Q → DESC reverses to 2550Q, 1701Q, 1601C
    expect(sortTasks(tasks, "formCode", "desc").map((t) => t.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
  it("returns new array (does not mutate input)", () => {
    const input = tasks.slice();
    sortTasks(tasks, "deadline", "desc");
    expect(tasks).toEqual(input);
  });
  it("is stable on equal primary keys (tiebreak by id)", () => {
    const same: TableTask[] = [
      mkTask({ id: "z", deadlineDate: new Date("2026-04-01T00:00:00Z") }),
      mkTask({ id: "a", deadlineDate: new Date("2026-04-01T00:00:00Z") }),
    ];
    expect(makeComparator("deadline", "asc")(same[0], same[1])).toBeGreaterThan(0);
  });
});

describe("paginate", () => {
  const tasks: TableTask[] = Array.from({ length: 120 }, (_, i) =>
    mkTask({ id: `t${i}`, clientName: `Client ${String(i).padStart(3, "0")}` }),
  );

  it("returns the first 50 by default", () => {
    const out = paginate(tasks, { pageIndex: 0, pageSize: 50 });
    expect(out.length).toBe(50);
    expect(out[0].id).toBe("t0");
    expect(out[49].id).toBe("t49");
  });
  it("returns the second page", () => {
    const out = paginate(tasks, { pageIndex: 1, pageSize: 50 });
    expect(out[0].id).toBe("t50");
    expect(out[49].id).toBe("t99");
  });
  it("returns partial last page", () => {
    const out = paginate(tasks, { pageIndex: 2, pageSize: 50 });
    expect(out.length).toBe(20);
  });
});

describe("computeTablePage", () => {
  const tasks: TableTask[] = [
    mkTask({ id: "1", clientName: "Acme", formCode: "2550Q", status: "pending" }),
    mkTask({ id: "2", clientName: "Acme", formCode: "1601C", status: "done" }),
    mkTask({ id: "3", clientName: "Beta", formCode: "2550Q", status: "ready_to_file" }),
  ];

  it("returns visible + total + pageCount", () => {
    const result = computeTablePage(
      tasks,
      EMPTY_TABLE_FILTER,
      "",
      "deadline",
      "asc",
      { pageIndex: 0, pageSize: 50 },
    );
    expect(result.visible.map((t) => t.id)).toEqual(["1", "2", "3"]);
    expect(result.total).toBe(3);
    expect(result.pageCount).toBe(1);
  });
  it("search + filter combine", () => {
    const result = computeTablePage(
      tasks,
      { ...EMPTY_TABLE_FILTER, status: "pending" },
      "Acme",
      "deadline",
      "asc",
      { pageIndex: 0, pageSize: 50 },
    );
    expect(result.visible.map((t) => t.id)).toEqual(["1"]);
    expect(result.total).toBe(1);
  });
});

describe("computeLegalActions", () => {
  it("admin + pending: edit + delete", () => {
    expect(computeLegalActions({ status: "pending", archived: false }, "admin")).toEqual({
      edit: true,
      delete: true,
      archive: false,
    });
  });
  it("bookkeeper + pending: edit only (no delete)", () => {
    expect(
      computeLegalActions({ status: "pending", archived: false }, "bookkeeper"),
    ).toEqual({ edit: true, delete: false, archive: false });
  });
  it("bookkeeper + done: archive only", () => {
    expect(computeLegalActions({ status: "done", archived: false }, "bookkeeper")).toEqual({
      edit: false,
      delete: false,
      archive: true,
    });
  });
  it("admin + done: archive only (no delete on non-pending)", () => {
    expect(computeLegalActions({ status: "done", archived: false }, "admin")).toEqual({
      edit: false,
      delete: false,
      archive: true,
    });
  });
  it("any + submitted: nothing actionable (slice #9 handles)", () => {
    expect(computeLegalActions({ status: "submitted", archived: false }, "admin")).toEqual({
      edit: false,
      delete: false,
      archive: false,
    });
  });
  it("any + ready_to_file: nothing (only #9's StatusActions handles)", () => {
    expect(computeLegalActions({ status: "ready_to_file", archived: false }, "admin")).toEqual({
      edit: false,
      delete: false,
      archive: false,
    });
  });
  it("archived status hides all actions", () => {
    expect(computeLegalActions({ status: "pending", archived: true }, "admin")).toEqual({
      edit: false,
      delete: false,
      archive: false,
    });
  });
});
