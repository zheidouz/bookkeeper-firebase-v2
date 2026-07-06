// TasksPage — slice #13 (task table) — /tasks route.
//
// Wraps <TaskTable> in the slice #12 DashboardFilters (so the
// filter strip is shared between the dashboard counts and the
// table) and the slice #8/#9 client/form caches. Per-row actions
// dispatch into the slice #10 archiveTask callable (for Archive)
// and slice #11's pattern (for Delete, which is admin-only).
//
// The route is lazy-loaded so the main bundle doesn't include the
// table code (per PRD: "React Router lazy-loads this route so the
// main bundle stays light").

import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { db, functions } from "@/lib/firebaseConfig";
import { useAuth } from "@/features/auth/useAuth";
import { useClients, type ClientRow } from "@/features/clients/useClients";
import { useTaxForms, type TaxFormRow } from "@/features/taxForms/useTaxForms";
import { useAllClientFormTasks } from "@/features/tasks/useAllClientFormTasks";
import TaskTable from "@/features/tasks/TaskTable";
import DashboardFilters, {
  EMPTY_FILTERS,
  type DashboardFilterValues,
  type DashboardScope,
} from "@/features/dashboard/DashboardFilters";
import { doc, deleteDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

export default function TasksPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const { data: clients } = useClients();
  const { data: taxForms } = useTaxForms();
  const { data: rows } = useAllClientFormTasks({
    scope: "all",
    currentUserId: user?.uid,
  });

  const [filters, setFilters] = useState<DashboardFilterValues>(EMPTY_FILTERS);
  const [scope, setScope] = useState<DashboardScope>(
    role === "admin" ? "all" : "mine",
  );

  const roleForTable: "admin" | "bookkeeper" =
    role === "admin" ? "admin" : "bookkeeper";

  // Wire the dashboard's filter shape into the table.
  const handleFiltersChange = useCallback((next: DashboardFilterValues) => {
    setFilters(next);
  }, []);
  const handleScopeChange = useCallback((next: DashboardScope) => {
    setScope(next);
  }, []);

  const handleEdit = useCallback(
    (row: { id: string }) => {
      // Slice #14 owns the Edit dialog inside <TaskDetailPage>.
      // Navigate the actor to the detail page where they can both
      // see context and click the Edit / Archive / status actions.
      navigate(`/tasks/${row.id}`);
    },
    [navigate],
  );

  const handleArchive = useCallback(async (row: { id: string }) => {
    // Call the slice #10 archiveTask callable via the SDK direct
    // path (no useArchiveTask hook here — keep the page's deps lean).
    const fn = httpsCallable<
      { taskId: string; notes?: string },
      { archivedTaskId: string; newTaskId: string; newDeadline: string }
    >(functions, "archiveTask");
    try {
      await fn({ taskId: row.id });
      // The TaskTable re-renders via onSnapshot — no toast needed.
    } catch (err) {
      console.error("archive failed", err);
      window.alert(
        `Archive failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }, []);

  const handleDelete = useCallback(
    async (row: { id: string }) => {
      if (role !== "admin") return;
      try {
        await deleteDoc(doc(db, "clientFormTasks", row.id));
      } catch (err) {
        console.error("delete failed", err);
        window.alert(
          `Delete failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    [role],
  );

  // When the scope changes, swap the all-tasks data.
  const tableRows =
    scope === "mine" && user
      ? rows.filter((r) => r.assignedBookkeeperId === user.uid)
      : rows;

  return (
    <div
      className="space-y-4 p-4 md:p-6"
      data-testid="tasks-page"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Tasks</h1>
          <p className="text-sm text-slate-500">
            All current task obligations, live from Firestore.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/")}
          data-testid="back-to-dashboard"
        >
          Back to dashboard
        </Button>
      </header>

      <Card className="p-3">
        <DashboardFilters
          filters={filters}
          onChange={handleFiltersChange}
          scope={scope}
          onScopeChange={handleScopeChange}
          roleDefault={roleForTable === "admin" ? "all" : "mine"}
        />
      </Card>

      <TaskTable
        rows={tableRows}
        clients={clients as readonly ClientRow[] | undefined}
        taxForms={taxForms as readonly TaxFormRow[] | undefined}
        role={roleForTable}
        currentUserId={user?.uid ?? null}
        onEdit={handleEdit}
        onArchive={handleArchive}
        onDelete={handleDelete}
      />
    </div>
  );
}

