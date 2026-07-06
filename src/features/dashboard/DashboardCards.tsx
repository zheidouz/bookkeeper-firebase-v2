// DashboardCards — 8-card summary grid for the dashboard.
//
// Reads dashboard rows from the TanStack Query cache (populated by
// `useDashboardCounts`), runs them through the pure
// `computeDashboardCounts` aggregator, and renders one card per
// metric. Cards surface the live count, the metric label, and an
// urgency-tinted background for the at-a-glance colour cue the
// spec asks for.

import { useMemo } from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { useAuth } from "@/features/auth/useAuth";
import {
  computeDashboardCounts,
  DASHBOARD_TASKS_KEY,
  type DashboardCounts,
  type DashboardScope,
} from "@/features/dashboard/useDashboardCounts";
import { useQuery } from "@tanstack/react-query";
import type { DashboardTaskRow } from "@/features/dashboard/useDashboardCounts";

interface DashboardCardsProps {
  scope: DashboardScope;
}

interface MetricDef {
  key: keyof DashboardCounts;
  label: string;
  helper: string;
  tone: "default" | "warning" | "danger" | "muted";
}

const METRICS: MetricDef[] = [
  { key: "pending", label: "Pending", helper: "Not started yet", tone: "default" },
  {
    key: "readyToFile",
    label: "Ready to file",
    helper: "Awaiting submission",
    tone: "default",
  },
  {
    key: "submitted",
    label: "Submitted",
    helper: "Filed with BIR",
    tone: "default",
  },
  { key: "done", label: "Done", helper: "Closed in period", tone: "default" },
  {
    key: "overdue",
    label: "Overdue",
    helper: "Past deadline",
    tone: "danger",
  },
  {
    key: "dueThisMonth",
    label: "Due this month",
    helper: "Calendar window",
    tone: "warning",
  },
  {
    key: "dueThisQuarter",
    label: "Due this quarter",
    helper: "Filing window",
    tone: "default",
  },
  {
    key: "archived",
    label: "Archived",
    helper: "Out of active view",
    tone: "muted",
  },
];

const TONE_CLASS: Record<MetricDef["tone"], string> = {
  default: "bg-white",
  warning: "bg-amber-50",
  danger: "bg-red-50",
  muted: "bg-zinc-50",
};

const NUMBER_TESTID: Record<keyof DashboardCounts, string> = {
  pending: "dashboard-count-pending",
  readyToFile: "dashboard-count-ready-to-file",
  submitted: "dashboard-count-submitted",
  done: "dashboard-count-done",
  overdue: "dashboard-count-overdue",
  dueThisMonth: "dashboard-count-due-this-month",
  dueThisQuarter: "dashboard-count-due-this-quarter",
  archived: "dashboard-count-archived",
};

const CARD_TESTID: Record<keyof DashboardCounts, string> = {
  pending: "dashboard-card-pending",
  readyToFile: "dashboard-card-ready-to-file",
  submitted: "dashboard-card-submitted",
  done: "dashboard-card-done",
  overdue: "dashboard-card-overdue",
  dueThisMonth: "dashboard-card-due-this-month",
  dueThisQuarter: "dashboard-card-due-this-quarter",
  archived: "dashboard-card-archived",
};

export default function DashboardCards({ scope }: DashboardCardsProps) {
  const { user } = useAuth();
  const { data } = useQuery<DashboardTaskRow[]>({
    queryKey: DASHBOARD_TASKS_KEY,
    queryFn: () => [],
  });

  const counts = useMemo(
    () =>
      computeDashboardCounts(
        data ?? [],
        scope,
        user?.uid ?? "",
      ),
    [data, scope, user?.uid],
  );

  return (
    <div
      data-testid="dashboard-cards"
      className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4"
    >
      {METRICS.map((m) => (
        <Card
          key={m.key}
          data-testid={CARD_TESTID[m.key]}
          className={`border-slate-200 ${TONE_CLASS[m.tone]}`}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">
              {m.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              data-testid={NUMBER_TESTID[m.key]}
              className="text-3xl font-semibold tabular-nums text-slate-900"
            >
              {counts[m.key]}
            </div>
            <p className="mt-1 text-xs text-slate-500">{m.helper}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}