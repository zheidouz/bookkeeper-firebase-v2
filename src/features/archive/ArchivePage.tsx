// ArchivePage — slice #15 — /archive route.
//
// Read-only history of every archived task (per the brief):
//   - Lists clientFormTasks where archived === true
//   - Columns: client / form code / form name / period / archived
//     date (relative) / archived by (display name resolved from
//     useBookkeepers)
//   - Search by client / year / form / bookkeeper via the
//     archiveReducer (pure, unit-testable)
//   - Clicking a row opens the same /tasks/:id detail page (slice #14)
//     but with all write actions hidden via a `readOnly` URL flag
//     (?readonly=1)
//
// Lazy-loaded with the rest of the /tasks bundle so the main
// bundle stays under its current size.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useArchivedClientFormTasks,
} from "@/features/archive/useArchivedClientFormTasks";
import {
  useClients,
} from "@/features/clients/useClients";
import { useTaxForms } from "@/features/taxForms/useTaxForms";
import { useUsers } from "@/features/users/useUsers";
import {
  computeArchivePage,
  distinctArchivedBy,
  distinctFormCodes,
  distinctYears,
  EMPTY_ARCHIVE_FILTER,
  relativeArchivedTime,
  sortArchive,
  type ArchiveFilter,
  type ArchiveRow,
  type ArchivalSortDir,
  type ArchivalSortKey,
} from "@/features/archive/archiveReducer";

const ALL_FILTER_VALUE = "__all__";

function asArchiveRow(
  r: ReturnType<typeof useArchivedClientFormTasks>["data"][number],
  clientName: string,
  formCode: string,
  formName: string,
  archivedByName: string | undefined,
  year: number,
): ArchiveRow {
  // The hook stores archivedAt as a Firestore Timestamp; convert
  // to a JS Date here for the page-level reducer.
  let archivedAtDate: Date;
  if (r.archivedAt && typeof (r.archivedAt as { toDate?: () => Date }).toDate === "function") {
    archivedAtDate = (r.archivedAt as { toDate: () => Date }).toDate();
  } else if (r.archivedAt instanceof Date) {
    archivedAtDate = r.archivedAt;
  } else {
    archivedAtDate = new Date(0);
  }
  return {
    id: r.id,
    clientId: r.clientId,
    clientName,
    formCode,
    formName,
    frequency: r.frequency,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    deadlineDate: r.deadlineDate,
    year,
    archivedAt: archivedAtDate,
    archivedBy: r.archivedBy ?? "",
    archivedByName,
    status: r.status,
  };
}

export default function ArchivePage() {
  const { data: rawRows } = useArchivedClientFormTasks();
  const { data: clients } = useClients();
  const { data: taxForms } = useTaxForms();
  const { data: users } = useUsers();

  const [filter, setFilter] = useState<ArchiveFilter>(EMPTY_ARCHIVE_FILTER);
  const [sortKey, setSortKey] = useState<ArchivalSortKey>("archivedAt");
  const [sortDir, setSortDir] = useState<ArchivalSortDir>("desc");

  // Pre-resolve the join fields for each row using the cache. Build
  // it as a derived Map for O(n) lookups instead of O(n²).
  const clientById = useMemo(() => {
    const m = new Map<string, string>();
    (clients ?? []).forEach((c) => m.set(c.id, c.businessName));
    return m;
  }, [clients]);
  const formById = useMemo(() => {
    const m = new Map<string, { code: string; name: string }>();
    (taxForms ?? []).forEach((f) =>
      m.set(f.id, { code: f.formCode, name: f.formName }),
    );
    return m;
  }, [taxForms]);
  const userById = useMemo(() => {
    const m = new Map<string, string>();
    (users ?? []).forEach((u) =>
      m.set(u.id, u.name ?? u.email ?? u.id),
    );
    return m;
  }, [users]);

  const rows = useMemo<ArchiveRow[]>(
    () =>
      rawRows.map((r) => {
        const f = formById.get(r.taxFormId);
        const c = clientById.get(r.clientId);
        const archivedByName = r.archivedBy
          ? userById.get(r.archivedBy)
          : undefined;
        return asArchiveRow(
          r,
          c ?? r.clientId,
          f?.code ?? r.taxFormId,
          f?.name ?? "",
          archivedByName,
          r.year,
        );
      }),
    [rawRows, clientById, formById, userById],
  );

  const visible = useMemo(
    () => computeArchivePage(rows, filter, sortKey, sortDir),
    [rows, filter, sortKey, sortDir],
  );

  // Facets derived from the unfiltered row set so dropdowns don't
  // collapse to "all" once a search is typed.
  const yearOptions = useMemo(() => distinctYears(rows), [rows]);
  const formOptions = useMemo(() => distinctFormCodes(rows), [rows]);
  const archivedByOptions = useMemo(
    () => distinctArchivedBy(rows),
    [rows],
  );

  function toggleSort(key: ArchivalSortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortHeader({ k, label }: { k: ArchivalSortKey; label: string }) {
    const active = sortKey === k;
    const arrow = active ? (sortDir === "asc" ? "▲" : "▼") : "↕";
    return (
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide ${
          active ? "text-slate-900" : "text-slate-500"
        }`}
        data-testid={`sort-${k}`}
      >
        {label}
        <span className="text-slate-400">{arrow}</span>
      </button>
    );
  }

  function setFilterPart<K extends keyof ArchiveFilter>(
    key: K,
    value: ArchiveFilter[K],
  ) {
    setFilter((f) => ({ ...f, [key]: value }));
  }

  // Pre-sort without filter for the empty-state count line ("showing
  // X of Y archived tasks").
  const unfilteredTotal = sortArchive(rows, "archivedAt", "desc").length;

  return (
    <div
      className="mx-auto max-w-6xl space-y-4 p-4 md:p-6"
      data-testid="archive-page"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Archive</h1>
          <p className="text-sm text-slate-500">
            Read-only history of all archived tasks, live from Firestore.
          </p>
        </div>
        <Link
          to="/tasks"
          className="text-xs text-slate-500 hover:text-slate-700"
          data-testid="back-to-tasks"
        >
          ← Back to tasks
        </Link>
      </header>

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="archive-search" className="text-xs text-slate-500">
              Search (client / form / bookkeeper)
            </Label>
            <Input
              id="archive-search"
              type="search"
              placeholder="Acme · 2550Q · Alice"
              value={filter.search}
              onChange={(e) => setFilterPart("search", e.target.value)}
              data-testid="archive-search"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Year</Label>
            <Select
              value={
                filter.year === "all" ? ALL_FILTER_VALUE : String(filter.year)
              }
              onValueChange={(v) =>
                setFilterPart(
                  "year",
                  v === ALL_FILTER_VALUE ? "all" : Number(v),
                )
              }
            >
              <SelectTrigger className="h-9 text-sm" data-testid="archive-filter-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTER_VALUE}>All years</SelectItem>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-slate-500">Form code</Label>
            <Select
              value={filter.formCode}
              onValueChange={(v) => setFilterPart("formCode", v)}
            >
              <SelectTrigger className="h-9 text-sm" data-testid="archive-filter-form">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTER_VALUE}>All forms</SelectItem>
                {formOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-slate-500">Archived by</Label>
            <Select
              value={filter.archivedByUid}
              onValueChange={(v) => setFilterPart("archivedByUid", v)}
            >
              <SelectTrigger className="h-9 text-sm" data-testid="archive-filter-by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTER_VALUE}>Anyone</SelectItem>
                {archivedByOptions.map((opt) => (
                  <SelectItem key={opt.uid} value={opt.uid}>
                    {opt.name ?? opt.uid.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <div className="text-xs text-slate-500" data-testid="archive-count">
        Showing {visible.length} of {unfilteredTotal} archived task
        {unfilteredTotal === 1 ? "" : "s"}
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortHeader k="client" label="Client" />
              </TableHead>
              <TableHead>
                <SortHeader k="formCode" label="Form" />
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Period
              </TableHead>
              <TableHead>
                <SortHeader k="year" label="Year" />
              </TableHead>
              <TableHead>
                <SortHeader k="archivedAt" label="Archived" />
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Archived by
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-slate-500">
                  No archived tasks match the current filter.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((r) => (
                <TableRow
                  key={r.id}
                  data-testid={`archive-row-${r.id}`}
                  data-archived-by-uid={r.archivedBy || ""}
                  data-year={r.year}
                >
                  <TableCell className="font-medium">
                    <Link
                      to={`/tasks/${r.id}?readonly=1`}
                      className="text-slate-900 hover:underline"
                    >
                      {r.clientName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs">{r.formCode}</span>
                    <div className="text-xs text-slate-500">{r.formName}</div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {r.periodStart.toISOString().slice(0, 10)} →{" "}
                    {r.periodEnd.toISOString().slice(0, 10)}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {r.year}
                  </TableCell>
                  <TableCell
                    className="text-xs"
                    title={r.archivedAt.toISOString()}
                  >
                    {relativeArchivedTime(r.archivedAt)}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {r.archivedByName ?? r.archivedBy.slice(0, 8)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {visible.length === 0 ? null : (
        <div className="text-center text-xs text-slate-500">
          Click a row to view the archived task (read-only).
        </div>
      )}
      {visible.length > 0 ? null : (
        <div className="text-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilter(EMPTY_ARCHIVE_FILTER)}
            data-testid="archive-clear-filters"
          >
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
