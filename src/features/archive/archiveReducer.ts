// archiveReducer.ts — slice #15 pure helpers for the /archive page.
//
// Pure (no React, no Firestore), so unit-testable without a browser
// or emulator. Mirrors the table-reducer split used by slice #13 —
// the page component is the React shell, the reducer is the math.

import type {
  TaskFrequency,
  TaskStatus,
} from "@/features/clientFormTasks/clientFormTaskSchema";

export type ArchivalStatus = "archived" | "all";
export type ArchivalSortKey = "archivedAt" | "client" | "formCode" | "year";
export type ArchivalSortDir = "asc" | "desc";

/**
 * Row shape for the archive page. Pre-resolved joins
 * (client display name, form code/name, bookkeeper name) live
 * here so the table doesn't need to thread the full cache at
 * render time.
 */
export interface ArchiveRow {
  id: string;
  clientId: string;
  /** Pre-resolved client display name. */
  clientName: string;
  /** Pre-resolved tax form code. */
  formCode: string;
  /** Pre-resolved tax form name. */
  formName: string;
  frequency: TaskFrequency;
  /** Period start (UTC). */
  periodStart: Date;
  /** Period end (UTC). */
  periodEnd: Date;
  /** Deadline (UTC) — preserved for context. */
  deadlineDate: Date;
  /** Year bucket for grouping + filtering. */
  year: number;
  /** When the archive transition happened (UTC). */
  archivedAt: Date;
  /** UID that archived the task — resolved to a display name
   *  by the caller (here it's just a string). */
  archivedBy: string;
  /** Display name for the actor (filled by the caller after
   *  lookup). Optional so the reducer doesn't need the users
   *  cache. */
  archivedByName?: string;
  status: TaskStatus;
  frequencyValue?: string;
}

export interface ArchiveFilter {
  /** Free-text search across clientName / formCode / formName. */
  search: string;
  /** Year bucket — `undefined` means all years. */
  year: number | "all";
  formCode: string | "all";
  archivedByUid: string | "all";
}

export const EMPTY_ARCHIVE_FILTER: ArchiveFilter = {
  search: "",
  year: "all",
  formCode: "all",
  archivedByUid: "all",
};

/**
 * Apply the archive filter to a list of rows. Pure.
 */
export function applyArchiveFilter(
  rows: readonly ArchiveRow[],
  filter: ArchiveFilter,
): ArchiveRow[] {
  const q = filter.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (q) {
      const haystack = `${r.clientName} ${r.formCode} ${r.formName}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (filter.year !== "all" && r.year !== filter.year) return false;
    if (filter.formCode !== "all" && r.formCode !== filter.formCode) return false;
    if (filter.archivedByUid !== "all" && r.archivedBy !== filter.archivedByUid)
      return false;
    return true;
  });
}

/**
 * Stable comparator factory (mirrors the slice #13 helper).
 * Tiebreaks by id for stable re-sorts.
 */
export function makeArchiveComparator(
  key: ArchivalSortKey,
  dir: ArchivalSortDir,
): (a: ArchiveRow, b: ArchiveRow) => number {
  const factor = dir === "asc" ? 1 : -1;
  return (a, b) => {
    let cmp = 0;
    switch (key) {
      case "archivedAt":
        cmp = a.archivedAt.getTime() - b.archivedAt.getTime();
        break;
      case "client":
        cmp = a.clientName.localeCompare(b.clientName);
        break;
      case "formCode":
        cmp = a.formCode.localeCompare(b.formCode);
        break;
      case "year":
        cmp = a.year - b.year;
        break;
    }
    if (cmp !== 0) return cmp * factor;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

export function sortArchive(
  rows: readonly ArchiveRow[],
  key: ArchivalSortKey,
  dir: ArchivalSortDir,
): ArchiveRow[] {
  return rows.slice().sort(makeArchiveComparator(key, dir));
}

/**
 * Convenience: filter → sort.
 */
export function computeArchivePage(
  rows: readonly ArchiveRow[],
  filter: ArchiveFilter,
  sortKey: ArchivalSortKey,
  sortDir: ArchivalSortDir,
): ArchiveRow[] {
  return sortArchive(applyArchiveFilter(rows, filter), sortKey, sortDir);
}

/**
 * Distinct-year facet from the row set. The /archive filter
 * uses this to populate the Year dropdown.
 */
export function distinctYears(rows: readonly ArchiveRow[]): number[] {
  const s = new Set<number>();
  for (const r of rows) s.add(r.year);
  return Array.from(s).sort((a, b) => b - a); // newest first
}

/**
 * Distinct-formCode facet from the row set.
 */
export function distinctFormCodes(rows: readonly ArchiveRow[]): string[] {
  const s = new Set<string>();
  for (const r of rows) s.add(r.formCode);
  return Array.from(s).sort();
}

/**
 * Distinct-archivedByUid facet from the row set.
 */
export function distinctArchivedBy(
  rows: readonly ArchiveRow[],
): { uid: string; name?: string }[] {
  const m = new Map<string, string | undefined>();
  for (const r of rows) {
    if (!r.archivedBy) continue;
    if (!m.has(r.archivedBy)) m.set(r.archivedBy, r.archivedByName);
  }
  return Array.from(m.entries()).map(([uid, name]) => ({ uid, name }));
}

/**
 * Relative-time formatter used by the page. Mirrors slice #14's
 * implementation, kept duplicated here so the reducer stays
 * dependency-free (no Intl.RelativeTimeFormat import).
 */
export function relativeArchivedTime(d: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - d.getTime();
  const abs = Math.abs(diffMs);
  const sec = Math.round(abs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  const month = Math.round(day / 30);
  const year = Math.round(day / 365);
  let v: string;
  if (sec < 60) v = `${sec}s`;
  else if (min < 60) v = `${min}m`;
  else if (hr < 24) v = `${hr}h`;
  else if (day < 30) v = `${day}d`;
  else if (month < 12) v = `${month}mo`;
  else v = `${year}y`;
  return diffMs < 0 ? `in ${v}` : `${v} ago`;
}
