// TaskDetailPage — slice #14 (task detail / edit page).
//
// `/tasks/{taskId}` route. Composes everything we built in slices
// #7 (client), #6 (tax form), #4 (deadline math), #9 (status
// actions + history), #10 (archive callable) into one page with
// 4 cards (client / form / deadline / notes) plus a status
// history section and the full action set.
//
// Notes save without a status change — the rules layer already
// allows bookkeepers to update notes on pending tasks (the legal
// no-op path), so we just `updateDoc({ notes, updatedAt })`.
//
// All write actions update the URL via React Router so a refresh
// preserves state. The page lazy-loads with the rest of the
// /tasks bundle (AppShell renders the Outlet; the route is
// mounted by React Router when /tasks/:id matches).

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/firebaseConfig";
import { useAuth } from "@/features/auth/useAuth";
import {
  useAllClientFormTasks,
  allClientFormTasksQueryKey,
} from "@/features/tasks/useAllClientFormTasks";
import { useTaskStatusHistory } from "@/features/clientFormTasks/useTaskStatusHistory";
import { useClients } from "@/features/clients/useClients";
import { useTaxForms } from "@/features/taxForms/useTaxForms";
import { useBookkeepers } from "@/features/clients/useBookkeepers";
import StatusBadge from "@/features/clientFormTasks/StatusBadge";
import StatusActions from "@/features/clientFormTasks/StatusActions";
import EditTaskDialog from "@/features/clientFormTasks/EditTaskDialog";
import ArchiveTaskDialog from "@/features/clientFormTasks/ArchiveTaskDialog";
import {
  computeLegalActions,
  isOverdue,
} from "@/features/tasks/taskTableReducer";

interface RelativeTime {
  value: string;
  tooltip: string;
}

/** Format a Date as a relative-time string ("2h ago", "5d ago")
 *  with a full ISO tooltip. Pure — no Intl.RelativeTimeFormat (we
 *  keep this slice dependency-free). */
function relativeTime(d: Date, now: Date = new Date()): RelativeTime {
  const diffMs = now.getTime() - d.getTime();
  const abs = Math.abs(diffMs);
  const future = diffMs < 0;
  const sec = Math.round(abs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  const month = Math.round(day / 30);
  const year = Math.round(day / 365);
  let value: string;
  if (sec < 60) value = `${sec}s`;
  else if (min < 60) value = `${min}m`;
  else if (hr < 24) value = `${hr}h`;
  else if (day < 30) value = `${day}d`;
  else if (month < 12) value = `${month}mo`;
  else value = `${year}y`;
  return {
    value: future ? `in ${value}` : `${value} ago`,
    tooltip: d.toISOString(),
  };
}

export default function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const readOnly = searchParams.get("readonly") === "1";
  const { user, role } = useAuth();
  const qc = useQueryClient();

  // Make sure the all-tasks subscription is hot (without this, the
  // page would need a second onSnapshot for the same collection).
  useAllClientFormTasks({
    scope: "all",
    currentUserId: user?.uid,
  });

  const task = useQuery({
    queryKey: [...allClientFormTasksQueryKey, taskId],
    queryFn: () =>
      (
        qc.getQueryData<ReturnType<typeof Object>[] | undefined>(
          allClientFormTasksQueryKey,
        ) ?? []
      ).find((r) => (r as { id: string }).id === taskId) ?? null,
    enabled: !!taskId,
  });

  // If the all-tasks cache is empty (first navigation), fall back
  // to a one-shot doc fetch.
  const fallbackTask = useQuery({
    queryKey: ["clientFormTasks", "single", taskId],
    queryFn: async () => {
      if (!taskId) return null;
      const snap = await import("firebase/firestore").then((m) =>
        m.getDoc(m.doc(db, "clientFormTasks", taskId)),
      );
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() };
    },
    enabled: !!taskId && !task.data,
  });

  const live = task.data ?? fallbackTask.data ?? null;

  const { data: clients } = useClients();
  const { data: taxForms } = useTaxForms();
  const { data: bookkeepers } = useBookkeepers();
  const { data: history } = useTaskStatusHistory(taskId ?? "");

  const [notes, setNotes] = useState<string>("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSavedAt, setNotesSavedAt] = useState<Date | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  // Sync local notes with the doc's notes once the data arrives.
  useEffect(() => {
    if (live && typeof (live as { notes?: string }).notes === "string") {
      setNotes((live as { notes: string }).notes);
    }
  }, [live]);

  if (!taskId) {
    return (
      <div className="p-6 text-sm text-slate-500" data-testid="task-detail-page">
        Missing task id.
      </div>
    );
  }

  if (!live) {
    return (
      <div
        className="p-6 text-sm text-slate-500"
        data-testid="task-detail-page"
        data-loading="true"
      >
        <Link
          to="/tasks"
          className="text-slate-700 underline hover:text-slate-900"
        >
          ← Back to tasks
        </Link>
        <div className="mt-4">Loading task…</div>
      </div>
    );
  }

  const client = clients?.find((c) => c.id === (live as { clientId: string }).clientId);
  const form = taxForms?.find(
    (f) => f.id === (live as { taxFormId: string }).taxFormId,
  );
  const bookkeeper = bookkeepers?.find(
    (b) => b.id === (live as { assignedBookkeeperId: string }).assignedBookkeeperId,
  );
  const deadline = (live as { deadlineDate: { toDate(): Date } }).deadlineDate?.toDate?.() ?? new Date();
  const periodStart = (live as { periodStart: { toDate(): Date } }).periodStart?.toDate?.() ?? new Date();
  const periodEnd = (live as { periodEnd: { toDate(): Date } }).periodEnd?.toDate?.() ?? new Date();
  const status = (live as { status: import("@/features/clientFormTasks/clientFormTaskSchema").TaskStatus }).status;

  const now = new Date();
  const overdue = isOverdue({ status, deadlineDate: deadline }, now);
  const days = Math.round(
    (deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
  );

  const actions = computeLegalActions(
    { status, archived: (live as { archived?: boolean }).archived === true },
    role === "admin" ? "admin" : "bookkeeper",
  );
  const canEditPending =
    actions.edit &&
    (role === "admin" ||
      (live as { assignedBookkeeperId: string }).assignedBookkeeperId === user?.uid);

  function handleAfterAction() {
    // Force the page to re-pull the snapshot via a no-op write that
    // bumps updatedAt via serverTimestamp. The onSnapshot in
    // useAllClientFormTasks will pick up the change. We keep the
    // page mounted; React Router stays on /tasks/:taskId.
    qc.invalidateQueries({ queryKey: allClientFormTasksQueryKey });
    qc.invalidateQueries({ queryKey: ["clientFormTasks", "single", taskId] });
  }

  async function saveNotes() {
    if (!taskId) return;
    setSavingNotes(true);
    try {
      await updateDoc(doc(db, "clientFormTasks", taskId), {
        notes,
        updatedAt: serverTimestamp(),
      });
      setNotesSavedAt(new Date());
    } catch (err) {
      console.error("notes save failed", err);
      window.alert(
        `Notes save failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setSavingNotes(false);
    }
  }

  return (
    <div
      className="mx-auto max-w-4xl space-y-4 p-4 md:p-6"
      data-testid="task-detail-page"
      data-task-status={status}
      data-overdue={overdue ? "true" : "false"}
    >
      <div className="flex items-center justify-between">
        <Link
          to="/tasks"
          className="text-xs text-slate-500 hover:text-slate-700"
          data-testid="back-to-tasks"
        >
          ← Back to tasks
        </Link>
        <span className="text-xs text-slate-400">
          task {taskId}
        </span>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              {form?.formCode ?? "?"} — {form?.formName ?? "Unknown form"}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <StatusBadge status={status} compact />
              <span
                className={`text-xs ${overdue ? "font-semibold text-rose-700" : "text-slate-600"}`}
                data-testid="days-remaining"
              >
                {deadline.getTime() < now.getTime() && status !== "done" && status !== "archived"
                  ? `${Math.abs(days)} days overdue`
                  : `${days} days remaining`}
              </span>
            </div>
          </div>
          <div
            className="flex flex-wrap items-center gap-2"
            data-testid="task-actions"
            data-readonly={readOnly ? "true" : "false"}
          >
            {!readOnly && canEditPending && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditOpen(true);
                }}
                data-testid="action-edit"
              >
                Edit
              </Button>
            )}
            {!readOnly && (
            <div onClick={(e: React.MouseEvent<HTMLDivElement>) => {
              // Don't let the dropdown toggle open the action menu —
              // we mount <StatusActions> directly below.
              e.stopPropagation();
            }}>
              <StatusActions
                task={live as React.ComponentProps<typeof StatusActions>["task"]}
                onSaved={() => {
                  handleAfterAction();
                }}
              />
            </div>
            )}
            {!readOnly && actions.archive && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setArchiveOpen(true);
                }}
                data-testid="action-archive"
              >
                Archive (create next)
              </Button>
            )}
            {!readOnly && role === "admin" && actions.delete && (
              <Button
                size="sm"
                variant="outline"
                className="text-rose-700"
                onClick={async () => {
                  if (!taskId) return;
                  if (!window.confirm("Delete this pending task?")) return;
                  try {
                    const { deleteDoc } = await import("firebase/firestore");
                    await deleteDoc(doc(db, "clientFormTasks", taskId));
                    handleAfterAction();
                    navigate("/tasks");
                  } catch (err) {
                    console.error(err);
                  }
                }}
                data-testid="action-delete"
              >
                Delete
              </Button>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="p-4" data-testid="client-card">
          <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Client
          </h2>
          {client ? (
            <div className="mt-2 space-y-1">
              <Link
                to={`/clients/${client.id}`}
                className="text-base font-medium text-slate-900 hover:underline"
              >
                {client.businessName}
              </Link>
              <div className="text-xs text-slate-600">
                {client.ownerName} · TIN {client.tin} · RDO {client.rdo}
              </div>
              <div className="text-xs text-slate-600">{client.address}</div>
              <div className="text-xs text-slate-600">
                {client.email} · {client.contactNumber}
              </div>
            </div>
          ) : (
            <div className="mt-2 text-xs text-slate-500">
              Client record not available for this task.
            </div>
          )}
        </Card>

        <Card className="p-4" data-testid="form-card">
          <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Form
          </h2>
          {form ? (
            <div className="mt-2 space-y-1">
              <div className="text-base font-medium text-slate-900">
                <span className="font-mono">{form.formCode}</span> — {form.formName}
              </div>
              <div className="text-xs text-slate-600">
                Category: {form.category} · Frequency: {form.defaultFrequency}
              </div>
              <div className="text-xs text-slate-600">{form.description}</div>
            </div>
          ) : (
            <div className="mt-2 text-xs text-slate-500">
              Tax form not available.
            </div>
          )}
        </Card>

        <Card className="p-4" data-testid="deadline-card">
          <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Deadline
          </h2>
          <div className="mt-2 space-y-1 text-sm">
            <div>
              <span className="text-xs text-slate-500">Period:</span>{" "}
              {periodStart.toISOString().slice(0, 10)} →{" "}
              {periodEnd.toISOString().slice(0, 10)}
            </div>
            <div>
              <span className="text-xs text-slate-500">Deadline:</span>{" "}
              <span
                className={overdue ? "font-semibold text-rose-700" : undefined}
              >
                {deadline.toISOString().slice(0, 10)}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-500">Bookkeeper:</span>{" "}
              {bookkeeper?.name ?? bookkeeper?.email ?? (live as { assignedBookkeeperId: string }).assignedBookkeeperId}
            </div>
          </div>
        </Card>

        <Card className="p-4" data-testid="notes-card" data-readonly={readOnly ? "true" : "false"}>
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Notes
            </h2>
            {notesSavedAt && (
              <span className="text-xs text-slate-400" data-testid="notes-saved-at">
                Saved {relativeTime(notesSavedAt, now).value}
              </span>
            )}
          </div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes for this task…"
            className="mt-2"
            rows={4}
            data-testid="notes-textarea"
            readOnly={readOnly}
            disabled={savingNotes || readOnly}
          />
          {!readOnly && (
            <div className="mt-2 flex items-center gap-2">
              <Button
                size="sm"
                onClick={saveNotes}
                disabled={savingNotes}
                data-testid="notes-save"
              >
                {savingNotes ? "Saving…" : "Save notes"}
              </Button>
              <span className="text-xs text-slate-400">
                Notes save without a status change.
              </span>
            </div>
          )}
          {readOnly && (
            <p className="mt-2 text-xs italic text-slate-400">
              Read-only view (this task is archived).
            </p>
          )}
        </Card>
      </div>

      <Card className="p-4" data-testid="status-history-card">
        <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Status history
        </h2>
        <div className="mt-2 space-y-2" data-testid="status-history-list">
          {(history ?? []).length === 0 ? (
            <div className="text-xs text-slate-500">
              No status changes recorded yet.
            </div>
          ) : (
            (history ?? []).map((h) => {
              const rel = relativeTime(
                typeof h.changedAt === "object" &&
                  h.changedAt &&
                  "toDate" in (h.changedAt as object)
                  ? ((h.changedAt as { toDate(): Date }).toDate())
                  : new Date(),
                now,
              );
              return (
                <div
                  key={h.id}
                  className="border-l-2 border-slate-200 pl-3"
                  data-testid="history-row"
                  data-old-status={h.oldStatus}
                  data-new-status={h.newStatus}
                >
                  <div className="text-xs text-slate-600">
                    <span className="font-mono">{h.oldStatus}</span>
                    {" → "}
                    <span className="font-mono font-semibold">
                      {h.newStatus}
                    </span>
                    {" · "}
                    <span className="text-slate-500" title={rel.tooltip}>
                      {rel.value}
                    </span>
                    {" · by "}
                    <span className="text-slate-700">{h.changedBy}</span>
                  </div>
                  {h.notes ? (
                    <div className="mt-0.5 text-xs italic text-slate-500">
                      "{h.notes}"
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </Card>

      {editOpen ? (
        live ? (
          <EditTaskDialog
            open={editOpen}
            onOpenChange={(o: boolean) => setEditOpen(o)}
            task={live as React.ComponentProps<typeof EditTaskDialog>["task"]}
            onSaved={() => {
              handleAfterAction();
              setEditOpen(false);
            }}
          />
        ) : null
      ) : null}
      {archiveOpen ? (
        live ? (
          <ArchiveTaskDialog
            open={archiveOpen}
            onOpenChange={(o: boolean) => setArchiveOpen(o)}
            task={live as unknown as React.ComponentProps<typeof ArchiveTaskDialog>["task"]}
            taxForm={form}
            onArchived={(result) => {
              handleAfterAction();
              setArchiveOpen(false);
              void result;
            }}
          />
        ) : null
      ) : null}
    </div>
  );
}
