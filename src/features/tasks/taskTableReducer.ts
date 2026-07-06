// Task table pure reducers — slice #13.
//
// Pure functions (no React, no Firestore) so the sort + filter +
// paginate logic is unit-testable without a browser / emulator.
//
// The shape of a task row is intentionally minimal — it matches
// ClientFormTaskRow from useClientFormTasks but only the fields
// the table actually consumes. The `client` and `taxForm` joins are
// pre-resolved by the caller (the table reads them from the
// useClients / useTaxForms caches), keeping this file ignorant of
// those hooks.

import type {
  TaskFrequency,
  TaskStatus,
} from "@/features/clientFormTasks/clientFormTaskSchema";

export type SortKey = "deadline" | "client" | "formCode";
export type SortDir = "asc" | "desc";

export interface TableTask {
  id: string;
  /** Firestore id of the client — for navigation. */
  clientId: string;
  /** Pre-resolved client display name. */
  clientName: string;
  /** Firestore id of the tax form. */
  taxFormId: string;
  /** Pre-resolved tax form code. */
  formCode: string;
  /** Pre-resolved tax form name. */
  formName: string;
  frequency: TaskFrequency;
  /** Period start (UTC). */
  periodStart: Date;
  /** Deadline (UTC). */
  deadlineDate: Date;
  assignedBookkeeperId: string;
  status: TaskStatus;
  archived: boolean;
  /** Optional bookkeeper display name (for the column). */
  bookkeeperName?: string;
}

export interface TaskTableFilter {
  clientId: string | "all";
  taxFormId: string | "all";
  status: TaskStatus | "all";
  overdueOnly: boolean;
}

export const EMPTY_TABLE_FILTER: TaskTableFilter = {
  clientId: "all",
  taxFormId: "all",
  status: "all",
  overdueOnly: false,
};

export interface Page {
  pageIndex: number;
  pageSize: number;
}

export const DEFAULT_PAGE: Page = { pageIndex: 0, pageSize: 50 };

export const PAGE_SIZE_OPTIONS: readonly number[] = [25, 50, 100] as const;

/**
 * Returns true if the task is overdue — status is not in {done,
 * archived} AND deadlineDate < now.
 */
export function isOverdue(t: Pick<TableTask, "status" | "deadlineDate">, now: Date = new Date()): boolean {
  if (t.status === "done" || t.status === "archived") return false;
  return t.deadlineDate.getTime() < now.getTime();
}

/**
 * Apply the table filter to a list of tasks. Pure.
 */
export function applyTableFilters(
  tasks: readonly TableTask[],
  filters: TaskTableFilter,
  now: Date = new Date(),
): TableTask[] {
  return tasks.filter((t) => {
    if (filters.clientId !== "all" && t.clientName !== filters.clientId) return false;
    if (filters.taxFormId !== "all" && t.formCode !== filters.taxFormId) return false;
    if (filters.status !== "all" && t.status !== filters.status) return false;
    if (filters.overdueOnly && !isOverdue(t, now)) return false;
    return true;
  });
}

/**
 * Case-insensitive substring search across clientName, formCode,
 * and formName.
 */
export function applyTableSearch(
  tasks: readonly TableTask[],
  query: string,
): TableTask[] {
  const q = query.trim().toLowerCase();
  if (!q) return tasks.slice();
  return tasks.filter(
    (t) =>
      t.clientName.toLowerCase().includes(q) ||
      t.formCode.toLowerCase().includes(q) ||
      t.formName.toLowerCase().includes(q),
  );
}

/**
 * Comparator factory. Uses a stable secondary key (id) so two tasks
 * with the same primary value maintain a deterministic order across
 * re-sorts.
 */
export function makeComparator(
  key: SortKey,
  dir: SortDir,
): (a: TableTask, b: TableTask) => number {
  const factor = dir === "asc" ? 1 : -1;
  return (a, b) => {
    let cmp = 0;
    if (key === "deadline") {
      cmp = a.deadlineDate.getTime() - b.deadlineDate.getTime();
    } else if (key === "client") {
      cmp = a.clientName.localeCompare(b.clientName);
    } else {
      // formCode
      cmp = a.formCode.localeCompare(b.formCode);
    }
    if (cmp !== 0) return cmp * factor;
    // Stable tiebreak
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

/**
 * Sort the tasks in place using the given sort key. Returns a NEW
 * array (does not mutate the input).
 */
export function sortTasks(
  tasks: readonly TableTask[],
  key: SortKey,
  dir: SortDir,
): TableTask[] {
  return tasks.slice().sort(makeComparator(key, dir));
}

/**
 * Slice a sorted/filtered list into a single page. Pure.
 */
export function paginate(
  tasks: readonly TableTask[],
  page: Page,
): TableTask[] {
  const start = page.pageIndex * page.pageSize;
  return tasks.slice(start, start + page.pageSize);
}

/**
 * Convenience: filter → search → sort → paginate. Returns the
 * displayed page plus the total visible count (for "showing N of M").
 */
export function computeTablePage(
  tasks: readonly TableTask[],
  filters: TaskTableFilter,
  search: string,
  sortKey: SortKey,
  sortDir: SortDir,
  page: Page,
  now: Date = new Date(),
): { visible: TableTask[]; total: number; pageCount: number } {
  const filtered = applyTableSearch(
    applyTableFilters(tasks, filters, now),
    search,
  );
  const sorted = sortTasks(filtered, sortKey, sortDir);
  return {
    visible: paginate(sorted, page),
    total: filtered.length,
    pageCount: Math.max(1, Math.ceil(filtered.length / page.pageSize)),
  };
}

/**
 * Decide which actions are legal for a task from a UI perspective
 * (the underlying transition functions also enforce server-side, but
 * the UI hides the buttons so the actor doesn't see options that
 * would be rejected). This is the "actions dropdown visibility"
 * helper — slice #14 has the more detailed action wiring.
 */
export interface LegalActions {
  edit: boolean;
  delete: boolean;
  archive: boolean;
}

export function computeLegalActions(
  task: Pick<TableTask, "status" | "archived">,
  role: "admin" | "bookkeeper",
): LegalActions {
  const isPending = task.status === "pending" && !task.archived;
  return {
    edit: isPending,
    delete: role === "admin" && isPending,
    // Archive is shown only when status === "done" (PRD story 34);
    // the actual transition is done via the archiveTask callable.
    archive: task.status === "done" && !task.archived,
  };
}
