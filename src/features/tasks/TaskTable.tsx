// TaskTable — slice #13 (task table) — the main working surface for
// bookkeepers. Renders the 10 columns from PRD story 50, with
// sortable headers, search, pagination, and per-row actions.
//
// Pure logic (sort/filter/paginate/search) lives in
// taskTableReducer.ts; this component is the React shell that wires
// the reducer output to shadcn <Table> + <Input> + <Button> +
// <DropdownMenu> primitives.
//
// Per-row actions:
//   - Edit (only when status==='pending' && actor is the assigned
//     bookkeeper or admin) — slice #14 will own the Edit dialog
//     proper; this component exposes a stub handler that the page
//     can override.
//   - Change status (slice #9's StatusActions) — only when there's a
//     legal next status.
//   - Archive (only when status==='done') — opens ArchiveTaskDialog.
//   - Delete (admin-only, only when status==='pending' &&
//     !archived) — fires onDelete handler.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import StatusBadge from "@/features/clientFormTasks/StatusBadge";
import {
  computeLegalActions,
  computeTablePage,
  DEFAULT_PAGE,
  EMPTY_TABLE_FILTER,
  PAGE_SIZE_OPTIONS,
  isOverdue,
  type Page,
  type SortDir,
  type SortKey,
  type TableTask,
  type TaskTableFilter,
} from "@/features/tasks/taskTableReducer";
import type { ClientFormTaskRow } from "@/features/clientFormTasks/useClientFormTasks";
import type { ClientRow } from "@/features/clients/useClients";
import type { TaxFormRow } from "@/features/taxForms/useTaxForms";

/**
 * Convert a ClientFormTaskRow (raw from Firestore) into a TableTask
 * (pre-resolved joins needed by the table). Falls back to the raw
 * id when the client/form cache hasn't loaded yet so the table still
 * renders.
 */
function toTableTask(
  row: ClientFormTaskRow,
  clients: readonly ClientRow[] | undefined,
  taxForms: readonly TaxFormRow[] | undefined,
): TableTask {
  const client = clients?.find((c) => c.id === row.clientId);
  const form = taxForms?.find((f) => f.id === row.taxFormId);
  return {
    id: row.id,
    clientId: row.clientId,
    clientName: client?.businessName ?? row.clientId,
    taxFormId: row.taxFormId,
    formCode: form?.formCode ?? row.taxFormId,
    formName: form?.formName ?? "",
    frequency: row.frequency,
    periodStart: row.periodStart,
    deadlineDate: row.deadlineDate,
    assignedBookkeeperId: row.assignedBookkeeperId,
    status: row.status,
    archived: row.archived,
    bookkeeperName: undefined,
  };
}

export interface TaskTableProps {
  /** Raw rows from the all-tasks hook. */
  rows: readonly ClientFormTaskRow[];
  /** Client + taxForm caches for the table to join. */
  clients: readonly ClientRow[] | undefined;
  taxForms: readonly TaxFormRow[] | undefined;
  /** Actor's role — controls Delete visibility. */
  role: "admin" | "bookkeeper" | null;
  /** Actor's uid — passed to legal-actions for the assigned check. */
  currentUserId: string | null;
  /** Per-row click handlers. The page wires these to dialog openers. */
  onEdit?: (task: ClientFormTaskRow) => void;
  onArchive?: (task: ClientFormTaskRow) => void;
  onDelete?: (task: ClientFormTaskRow) => void;
}

const SEARCH_DEBOUNCE_MS = 200;

export default function TaskTable({
  rows,
  clients,
  taxForms,
  role,
  currentUserId,
  onEdit,
  onArchive,
  onDelete,
}: TaskTableProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("deadline");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState<Page>(DEFAULT_PAGE);
  const [filters, setFilters] = useState<TaskTableFilter>(EMPTY_TABLE_FILTER);

  // Debounce the search input so the table doesn't re-compute on
  // every keystroke. The 200ms is a PRD requirement.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  // Reset to first page whenever the visible-row set could change.
  useEffect(() => {
    setPage((p) => ({ ...p, pageIndex: 0 }));
  }, [debouncedSearch, filters, sortKey, sortDir]);

  const tasks = useMemo(
    () => rows.map((r) => toTableTask(r, clients, taxForms)),
    [rows, clients, taxForms],
  );

  const now = new Date();
  const { visible, total, pageCount } = useMemo(
    () => computeTablePage(tasks, filters, debouncedSearch, sortKey, sortDir, page, now),
    [tasks, filters, debouncedSearch, sortKey, sortDir, page, now],
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortHeader({ k, label }: { k: SortKey; label: string }) {
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

  return (
    <div className="space-y-3" data-testid="task-table">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          type="search"
          placeholder="Search client, form code, or form name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
          data-testid="task-search"
        />
        <span className="text-xs text-slate-500" data-testid="task-counts">
          {total} task{total === 1 ? "" : "s"} match the current filter
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><SortHeader k="client" label="Client" /></TableHead>
              <TableHead><SortHeader k="formCode" label="Form" /></TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-slate-500">Frequency</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-slate-500">Period</TableHead>
              <TableHead><SortHeader k="deadline" label="Deadline" /></TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-slate-500">Assigned to</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-slate-500">Days</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-slate-500">Actions</TableHead>
            </TableRow>
            {/* The slice #12 filter strip lives above the table, but
                we surface the highest-value filter (status) inline
                here for quick narrowing. The other filters stay in
                DashboardFilters. */}
            <TableRow className="bg-slate-50">
              <TableHead colSpan={2} />
              <TableHead colSpan={3} className="text-xs text-slate-500">
                <span className="mr-2">Filter status:</span>
                <Select
                  value={filters.status}
                  onValueChange={(v) =>
                    setFilters({ ...filters, status: v as TaskTableFilter["status"] })
                  }
                >
                  <SelectTrigger className="inline-flex h-7 w-40 text-xs" data-testid="table-filter-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="ready_to_file">Ready to file</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead colSpan={4} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-slate-500">
                  No tasks match the current filter.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((t) => {
                const row = rows.find((r) => r.id === t.id);
                if (!row) return null;
                const actions = computeLegalActions(t, role ?? "bookkeeper");
                const overdue = isOverdue(t, now);
                const days = Math.round(
                  (t.deadlineDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
                );
                const daysLabel =
                  t.status === "done" || t.status === "archived"
                    ? "—"
                    : overdue
                    ? `${-days}d overdue`
                    : `${days}d`;
                const editEnabled =
                  actions.edit &&
                  (role === "admin" || row.assignedBookkeeperId === currentUserId);
                return (
                  <TableRow
                    key={t.id}
                    data-testid={`task-row-${t.id}`}
                    data-status={t.status}
                    data-overdue={overdue ? "true" : "false"}
                  >
                    <TableCell className="font-medium">
                      <Link
                        to={`/clients/${t.clientId}`}
                        className="text-slate-900 hover:underline"
                      >
                        {t.clientName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{t.formCode}</span>
                      <div className="text-xs text-slate-500">{t.formName}</div>
                    </TableCell>
                    <TableCell className="text-xs capitalize">
                      {t.frequency.replace("_", " ")}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {t.periodStart.toISOString().slice(0, 10)} →{" "}
                      {t.deadlineDate.toISOString().slice(0, 10)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {t.deadlineDate.toISOString().slice(0, 10)}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {t.bookkeeperName ?? t.assignedBookkeeperId.slice(0, 6)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={t.status} compact />
                    </TableCell>
                    <TableCell
                      className={`text-xs ${
                        overdue ? "font-semibold text-rose-700" : "text-slate-600"
                      }`}
                    >
                      {daysLabel}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            data-testid={`row-actions-trigger-${t.id}`}
                          >
                            Actions
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Task actions</DropdownMenuLabel>
                          <DropdownMenuItem asChild>
                            <Link to={`/clients/${t.clientId}`}>View</Link>
                          </DropdownMenuItem>
                          {editEnabled && onEdit ? (
                            <DropdownMenuItem
                              onClick={() => onEdit(row)}
                              data-testid={`row-action-edit-${t.id}`}
                            >
                              Edit
                            </DropdownMenuItem>
                          ) : null}
                          {actions.archive && onArchive ? (
                            <DropdownMenuItem
                              onClick={() => onArchive(row)}
                              data-testid={`row-action-archive-${t.id}`}
                            >
                              Archive (create next)
                            </DropdownMenuItem>
                          ) : null}
                          {role === "admin" && actions.delete && onDelete ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => onDelete(row)}
                                className="text-rose-700"
                                data-testid={`row-action-delete-${t.id}`}
                              >
                                Delete (admin)
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span data-testid="table-pagination">
          Page {page.pageIndex + 1} of {pageCount} · {visible.length} row
          {visible.length === 1 ? "" : "s"} shown
        </span>
        <div className="flex items-center gap-2">
          <Select
            value={String(page.pageSize)}
            onValueChange={(v) => {
              const next = Number(v);
              setPage({ pageIndex: 0, pageSize: next });
            }}
          >
            <SelectTrigger className="h-7 w-24 text-xs" data-testid="page-size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            disabled={page.pageIndex === 0}
            onClick={() =>
              setPage((p) => ({ ...p, pageIndex: p.pageIndex - 1 }))
            }
            data-testid="page-prev"
          >
            Prev
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page.pageIndex >= pageCount - 1}
            onClick={() =>
              setPage((p) => ({ ...p, pageIndex: p.pageIndex + 1 }))
            }
            data-testid="page-next"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
