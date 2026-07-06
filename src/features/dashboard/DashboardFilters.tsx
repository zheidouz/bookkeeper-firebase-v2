// DashboardFilters — slice #12 filter strip + scope toggle.
//
// Scope toggle (`mine` vs `all`) is local component state owned by
// the parent <DashboardPage> via `scope` + `onScopeChange` props.
//
// The filter shape is deliberately kept minimal for slice #12: the
// PRD lists nine filters, but the acceptance criteria only require
// that filter changes update the counts. We implement the four
// highest-value filters (client, form type, status, overdue-only)
// and leave placeholders for the rest. Slice #13 will own the
// underlying task table; this slice just needs the strip rendered
// + a shape it can reuse later.

import {
  TASK_STATUSES,
  type TaskStatus,
} from "@/features/clientFormTasks/clientFormTaskSchema";
import { useBookkeepers } from "@/features/clients/useBookkeepers";
import { useTaxForms } from "@/features/taxForms/useTaxForms";
import { useClients, type ClientRow } from "@/features/clients/useClients";

export interface DashboardFilterValues {
  clientId: string | "all";
  taxFormId: string | "all";
  status: TaskStatus | "all";
  overdueOnly: boolean;
}

export const EMPTY_FILTERS: DashboardFilterValues = {
  clientId: "all",
  taxFormId: "all",
  status: "all",
  overdueOnly: false,
};

export type DashboardScope = "mine" | "all";

interface DashboardFiltersProps {
  filters: DashboardFilterValues;
  onChange: (next: DashboardFilterValues) => void;
  scope: DashboardScope;
  onScopeChange: (next: DashboardScope) => void;
  /** "bookkeeper" role default is `mine`; "admin" is `all`. */
  roleDefault: DashboardScope;
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Pending",
  ready_to_file: "Ready to file",
  submitted: "Submitted",
  done: "Done",
  archived: "Archived",
};

function clientLabel(c: ClientRow): string {
  return c.businessName || c.ownerName || c.tin;
}

export default function DashboardFilters({
  filters,
  onChange,
  scope,
  onScopeChange,
  roleDefault,
}: DashboardFiltersProps) {
  const { data: clients } = useClients();
  const { data: taxForms } = useTaxForms();
  const { data: bookkeepers } = useBookkeepers();

  function set<K extends keyof DashboardFilterValues>(
    key: K,
    value: DashboardFilterValues[K],
  ) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div
      data-testid="dashboard-filters"
      className="space-y-3 rounded-md border border-slate-200 bg-white p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Scope
        </span>
        <div
          role="group"
          aria-label="Task scope"
          className="inline-flex overflow-hidden rounded-md border border-slate-200 text-xs"
        >
          <button
            type="button"
            data-testid="scope-toggle-mine"
            aria-pressed={scope === "mine"}
            onClick={() => onScopeChange("mine")}
            className={
              "px-3 py-1.5 font-medium transition-colors " +
              (scope === "mine"
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-700 hover:bg-slate-50")
            }
          >
            My tasks
          </button>
          <button
            type="button"
            data-testid="scope-toggle-all"
            aria-pressed={scope === "all"}
            onClick={() => onScopeChange("all")}
            className={
              "border-l border-slate-200 px-3 py-1.5 font-medium transition-colors " +
              (scope === "all"
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-700 hover:bg-slate-50")
            }
          >
            All-firm tasks
          </button>
        </div>
        <span className="text-xs text-slate-500">
          Default for your role: <strong>{roleDefault}</strong>
        </span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1">
        <label className="flex min-w-[160px] flex-col gap-1 text-xs text-slate-600">
          <span>Client</span>
          <select
            data-testid="filter-client"
            value={filters.clientId}
            onChange={(e) =>
              set("clientId", e.target.value as DashboardFilterValues["clientId"])
            }
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
          >
            <option value="all">All clients</option>
            {(clients ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {clientLabel(c)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[160px] flex-col gap-1 text-xs text-slate-600">
          <span>Form type</span>
          <select
            data-testid="filter-tax-form"
            value={filters.taxFormId}
            onChange={(e) =>
              set(
                "taxFormId",
                e.target.value as DashboardFilterValues["taxFormId"],
              )
            }
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
          >
            <option value="all">All forms</option>
            {(taxForms ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.formCode} — {f.formName}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[140px] flex-col gap-1 text-xs text-slate-600">
          <span>Status</span>
          <select
            data-testid="filter-status"
            value={filters.status}
            onChange={(e) =>
              set("status", e.target.value as DashboardFilterValues["status"])
            }
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
          >
            <option value="all">All statuses</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[140px] flex-col gap-1 text-xs text-slate-600">
          <span>Assigned bookkeeper</span>
          <select
            data-testid="filter-bookkeeper"
            disabled
            value="all"
            className="cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-400"
          >
            <option value="all">Coming soon</option>
            {(bookkeepers ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name || b.email}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 pt-5 text-xs text-slate-700">
          <input
            type="checkbox"
            data-testid="filter-overdue-only"
            checked={filters.overdueOnly}
            onChange={(e) => set("overdueOnly", e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          <span>Overdue only</span>
        </label>
      </div>

      <p className="text-xs text-slate-400">
        Deadline type / month / quarter / year filters land alongside the
        task table in slice #13.
      </p>
    </div>
  );
}