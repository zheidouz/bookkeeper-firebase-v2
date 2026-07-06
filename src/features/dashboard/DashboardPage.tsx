// DashboardPage — slice #12 / issue #12. Replaces the slice #3
// placeholder at `/`.
//
// Composition (top → bottom):
//   1. Header: page title + scope toggle.
//   2. Eight summary cards in a responsive grid (DashboardCards).
//   3. Filter strip (DashboardFilters) with client / form / status /
//      overdue-only live, and placeholders for the rest.
//   4. Placeholder area for the upcoming slice #13 task table.

import { useMemo, useState } from "react";

import DashboardCards from "@/features/dashboard/DashboardCards";
import DashboardFilters, {
  EMPTY_FILTERS,
  type DashboardFilterValues,
  type DashboardScope,
} from "@/features/dashboard/DashboardFilters";
import {
  computeDashboardCounts,
  computeTaskUrgency,
  DASHBOARD_TASKS_KEY,
  useDashboardCounts,
} from "@/features/dashboard/useDashboardCounts";
import { useAuth } from "@/features/auth/useAuth";
import { useQuery } from "@tanstack/react-query";
import type { DashboardTaskRow } from "@/features/dashboard/useDashboardCounts";

function defaultScopeForRole(
  role: "admin" | "bookkeeper" | "staff",
): DashboardScope {
  if (role === "admin") return "all";
  if (role === "bookkeeper") return "mine";
  return "all";
}

/**
 * Apply the active filter strip to the dashboard task rows. Returns
 * the filtered subset that would feed the slice #13 table. The
 * dashboard cards themselves remain unfiltered by client/form (they
 * represent firm-wide pipeline), but the filter strip affects the
 * underlying list the table will show.
 */
export function applyDashboardFilters(
  rows: readonly DashboardTaskRow[],
  filters: DashboardFilterValues,
  now: Date,
): DashboardTaskRow[] {
  return rows.filter((r) => {
    if (filters.clientId !== "all" && r.clientId !== filters.clientId)
      return false;
    if (filters.taxFormId !== "all" && r.taxFormId !== filters.taxFormId)
      return false;
    if (filters.status !== "all" && r.status !== filters.status)
      return false;
    if (
      filters.overdueOnly &&
      computeTaskUrgency(r.status, r.deadlineDate, now, r.archived) !==
        "overdue"
    ) {
      return false;
    }
    return true;
  });
}

export default function DashboardPage() {
  const { user, role } = useAuth();
  // Side-effect: open the clientFormTasks onSnapshot and push rows
  // into the TanStack Query cache. The hook does the heavy lifting
  // and returns the same useQuery result we re-read below.
  useDashboardCounts();
  const [scope, setScope] = useState<DashboardScope>(() =>
    defaultScopeForRole(role),
  );
  const [filters, setFilters] = useState<DashboardFilterValues>(EMPTY_FILTERS);

  const { data } = useQuery<DashboardTaskRow[]>({
    queryKey: DASHBOARD_TASKS_KEY,
    queryFn: () => [],
  });

  const rows = data ?? [];
  const filteredRows = useMemo(
    () => applyDashboardFilters(rows, filters, new Date()),
    [rows, filters],
  );

  // The cards themselves stay unfiltered (firm-wide at-a-glance),
  // but the "filtered list" feed below reflects the active strip.
  const counts = useMemo(
    () =>
      computeDashboardCounts(
        rows,
        scope,
        user?.uid ?? "",
      ),
    [rows, scope, user?.uid],
  );

  return (
    <div data-testid="dashboard-page" className="space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Filing health across the firm, live from Firestore.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            data-testid="dashboard-filtered-count"
            className="text-xs text-slate-500"
          >
            {filteredRows.length} task{filteredRows.length === 1 ? "" : "s"}{" "}
            match the current filter · {counts.overdue} overdue ·{" "}
            {counts.dueThisMonth} due this month
          </span>
          <a
            href="/tasks"
            data-testid="dashboard-view-tasks"
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            View all tasks →
          </a>
        </div>
      </header>

      <DashboardFilters
        filters={filters}
        onChange={setFilters}
        scope={scope}
        onScopeChange={setScope}
        roleDefault={defaultScopeForRole(role)}
      />

      <DashboardCards scope={scope} />

      <section
        data-testid="dashboard-task-list-placeholder"
        className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500"
      >
        <p className="font-medium text-slate-700">
          Task list — coming in slice #13
        </p>
        <p className="mt-1">
          The task table will mount below this filter strip, fed by
          the same <code>clientFormTasks</code> collection and the
          active filter values above. {filteredRows.length} row
          {filteredRows.length === 1 ? "" : "s"} are ready for it.
        </p>
      </section>
    </div>
  );
}