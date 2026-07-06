// ArchiveTaskDialog — slice #10 (PRD stories 34 + 35).
//
// Confirmation dialog shown when a bookkeeper/admin clicks "Archive"
// on a `done` task. It previews the NEXT period's range and deadline
// (computed the same way the archiveTask callable computes them, using
// the client-side recurrence + deadline libs and the seeded holiday
// set) so the actor confirms against real numbers before committing.
//
// On confirm it invokes the archiveTask callable. On success the parent
// list drops the now-archived row (useClientFormTasks filters
// archived === false) and the new pending row streams in via the same
// onSnapshot. We surface the returned deadline in a success line.

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { calculateNextDeadline } from "@/lib/deadline";
import { nextPeriod } from "@/lib/recurrence";
import { useArchiveTask } from "@/features/clientFormTasks/useArchiveTask";
import { useHolidays } from "@/features/clientFormTasks/useHolidays";
import type { ClientFormTaskRow } from "@/features/clientFormTasks/useClientFormTasks";
import type { TaxFormRow } from "@/features/taxForms/useTaxForms";

interface ArchiveTaskDialogProps {
  task: ClientFormTaskRow;
  taxForm: TaxFormRow | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after a successful archive with the returned next deadline. */
  onArchived?: (result: { newTaskId: string; newDeadline: string }) => void;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function ArchiveTaskDialog({
  task,
  taxForm,
  open,
  onOpenChange,
  onArchived,
}: ArchiveTaskDialogProps) {
  const { run, busy, error, setError } = useArchiveTask();
  const [notes, setNotes] = useState("");

  // Compute the next period from the current task. `null` for a
  // 'custom' frequency, which cannot roll forward automatically.
  const period = useMemo(
    () =>
      nextPeriod({
        periodStart: task.periodStart,
        periodEnd: task.periodEnd,
        frequency: task.frequency,
      }),
    [task.periodStart, task.periodEnd, task.frequency],
  );

  // Load the holiday set for the successor's period + deadline years so
  // the previewed deadline matches the callable's computation.
  const holidayYears = useMemo(() => {
    if (!period) return [];
    return Array.from(
      new Set([
        period.periodEnd.getUTCFullYear(),
        period.periodEnd.getUTCFullYear() + 1,
      ]),
    );
  }, [period]);
  const { data: holidays } = useHolidays(holidayYears);

  const preview = useMemo(() => {
    if (!period || !taxForm) return null;
    const deadline = calculateNextDeadline(
      taxForm.formCode,
      taxForm.defaultDeadlineRule,
      period.periodEnd,
      holidays ?? new Set<string>(),
      taxForm.deadlineShift ?? undefined,
    );
    return {
      periodStart: iso(period.periodStart),
      periodEnd: iso(period.periodEnd),
      deadline: iso(deadline),
    };
  }, [period, taxForm, holidays]);

  useEffect(() => {
    if (open) {
      setNotes("");
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task.id]);

  function handleOpenChange(next: boolean) {
    if (!next) setError(null);
    onOpenChange(next);
  }

  async function onConfirm() {
    const result = await run({ taskId: task.id, notes: notes.trim() });
    if (result) {
      onArchived?.({
        newTaskId: result.newTaskId,
        newDeadline: result.newDeadline,
      });
      handleOpenChange(false);
    }
  }

  const cannotRoll = period === null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive this task</DialogTitle>
          <DialogDescription>
            Archiving marks this filing complete and opens the next
            period&apos;s task automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {cannotRoll ? (
            <div
              role="alert"
              data-testid="archive-dialog-custom-warning"
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
            >
              This task uses a <span className="font-medium">custom</span>{" "}
              frequency, so the next period can&apos;t be created
              automatically. Archiving is disabled — create the next
              task manually instead.
            </div>
          ) : (
            <div
              data-testid="archive-dialog-preview"
              className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm"
            >
              <p className="font-medium text-slate-700">
                Next period will be created:
              </p>
              <dl className="mt-2 space-y-1 text-slate-600">
                <div className="flex justify-between gap-4">
                  <dt>Period</dt>
                  <dd data-testid="archive-dialog-next-period">
                    {preview
                      ? `${preview.periodStart} → ${preview.periodEnd}`
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Deadline</dt>
                  <dd data-testid="archive-dialog-next-deadline">
                    {preview ? preview.deadline : "—"}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="archive-notes"
              className="text-sm font-medium"
            >
              Note (optional)
            </label>
            <textarea
              id="archive-notes"
              data-testid="archive-dialog-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={busy || cannotRoll}
              placeholder="Anything to record with this archive?"
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {error && (
            <div
              role="alert"
              data-testid="archive-dialog-error"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={busy || cannotRoll}
            data-testid="archive-dialog-confirm"
          >
            {busy ? "Archiving…" : "Archive & create next"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
