// AttachFormDialog — slice #8. From /clients/:id, a bookkeeper
// (or admin) selects a tax form, a period, and a deadline, and the
// system creates a new clientFormTasks document in 'pending' status.
//
// On submit, we validate with the Zod schema, derive the indexed
// year / monthOrQuarter via deriveTaskMeta, and write the doc with
// serverTimestamp'd createdAt/updatedAt. The deadline defaults to
// calculateNextDeadline(formCode, rule, periodEnd, emptySet) — the
// first attach runs with an empty holiday set since the firm has not
// seeded holidays yet (slice #11/12). The bookkeeper can override.

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  addDoc,
  collection,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { db } from "@/lib/firebaseConfig";
import {
  calculateNextDeadline,
  type DeadlineRule,
} from "@/lib/deadline";
import { deriveTaskMeta } from "@/lib/deriveTaskMeta";
import {
  clientFormTaskInputSchema,
  TASK_FREQUENCIES,
  type ClientFormTaskInput,
  type TaskFrequency,
} from "@/features/clientFormTasks/clientFormTaskSchema";
import { useTaxForms } from "@/features/taxForms/useTaxForms";
import { useBookkeepers } from "@/features/clients/useBookkeepers";

interface AttachFormDialogProps {
  clientId: string;
  defaultBookkeeperId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional callback after a successful create. */
  onCreated?: () => void;
}

const NO_FORM = "__no_forms__";
const NO_BOOKKEEPER = "__no_bookkeeper__";

function toDateInputValue(d: Date): string {
  // yyyy-mm-dd in UTC; <input type="date"> wants the bare ISO date.
  return d.toISOString().slice(0, 10);
}

function defaultPeriodRange(
  frequency: TaskFrequency,
  referenceYear: number,
): { periodStart: string; periodEnd: string } {
  // The default period is "the first period of the current calendar
  // year" so the dialog is one click away from a valid state.
  switch (frequency) {
    case "monthly": {
      return {
        periodStart: `${referenceYear}-01-01`,
        periodEnd: `${referenceYear}-01-31`,
      };
    }
    case "quarterly": {
      return {
        periodStart: `${referenceYear}-01-01`,
        periodEnd: `${referenceYear}-03-31`,
      };
    }
    case "semi_annual": {
      return {
        periodStart: `${referenceYear}-01-01`,
        periodEnd: `${referenceYear}-06-30`,
      };
    }
    case "annual":
    case "custom":
    default: {
      return {
        periodStart: `${referenceYear}-01-01`,
        periodEnd: `${referenceYear}-12-31`,
      };
    }
  }
}

function defaultDeadlineDate(
  formCode: string,
  rule: DeadlineRule,
  periodEndStr: string,
): string {
  try {
    const d = calculateNextDeadline(
      formCode,
      rule,
      new Date(`${periodEndStr}T00:00:00Z`),
      new Set(),
    );
    return toDateInputValue(d);
  } catch {
    return "";
  }
}

export default function AttachFormDialog({
  clientId,
  defaultBookkeeperId,
  open,
  onOpenChange,
  onCreated,
}: AttachFormDialogProps) {
  const { data: taxForms } = useTaxForms();
  const { data: bookkeepers } = useBookkeepers();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedFormId, setSelectedFormId] = useState<string>("");

  const activeForms = useMemo(
    () => (taxForms ?? []).filter((f) => f.isActive),
    [taxForms],
  );

  const currentYear = new Date().getUTCFullYear();

  const form = useForm<ClientFormTaskInput>({
    resolver: zodResolver(clientFormTaskInputSchema),
    defaultValues: {
      clientId,
      taxFormId: "",
      assignedBookkeeperId: defaultBookkeeperId,
      frequency: "monthly",
      periodStart: new Date(`${currentYear}-01-01T00:00:00Z`),
      periodEnd: new Date(`${currentYear}-01-31T00:00:00Z`),
      deadlineDate: new Date(`${currentYear}-02-28T00:00:00Z`),
      status: "pending",
      archived: false,
      notes: "",
    },
  });

  // Reset whenever the dialog opens so the previous attach's draft
  // doesn't bleed through.
  useEffect(() => {
    if (open) {
      form.reset({
        clientId,
        taxFormId: "",
        assignedBookkeeperId: defaultBookkeeperId,
        frequency: "monthly",
        periodStart: new Date(`${currentYear}-01-01T00:00:00Z`),
        periodEnd: new Date(`${currentYear}-01-31T00:00:00Z`),
        deadlineDate: new Date(`${currentYear}-02-28T00:00:00Z`),
        status: "pending",
        archived: false,
        notes: "",
      });
      setSelectedFormId("");
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientId, defaultBookkeeperId]);

  // When the user picks a form, default the frequency and the deadline
  // to the form's own defaults so the dialog stays one click away from
  // a valid state.
  useEffect(() => {
    if (!selectedFormId) return;
    const f = activeForms.find((x) => x.id === selectedFormId);
    if (!f) return;
    const period = defaultPeriodRange(f.defaultFrequency, currentYear);
    form.setValue("frequency", f.defaultFrequency, { shouldDirty: true });
    form.setValue("periodStart", new Date(`${period.periodStart}T00:00:00Z`), {
      shouldDirty: true,
    });
    form.setValue("periodEnd", new Date(`${period.periodEnd}T00:00:00Z`), {
      shouldDirty: true,
    });
    form.setValue("taxFormId", selectedFormId, { shouldDirty: true });
    form.setValue(
      "deadlineDate",
      new Date(
        `${defaultDeadlineDate(f.formCode, f.defaultDeadlineRule, period.periodEnd) || `${currentYear}-02-28`}T00:00:00Z`,
      ),
      { shouldDirty: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFormId, activeForms, currentYear]);

  function handleOpenChange(next: boolean) {
    if (!next) setError(null);
    onOpenChange(next);
  }

  async function onSubmit(values: ClientFormTaskInput) {
    setBusy(true);
    setError(null);
    try {
      const periodStart = values.periodStart;
      const periodEnd = values.periodEnd;
      const deadlineDate = values.deadlineDate;
      const meta = deriveTaskMeta(values.frequency, periodStart);
      const payload = {
        clientId: values.clientId,
        taxFormId: values.taxFormId,
        assignedBookkeeperId: values.assignedBookkeeperId,
        frequency: values.frequency,
        periodStart: Timestamp.fromDate(periodStart),
        periodEnd: Timestamp.fromDate(periodEnd),
        deadlineDate: Timestamp.fromDate(deadlineDate),
        status: values.status,
        archived: values.archived,
        notes: values.notes ?? "",
        year: meta.year,
        monthOrQuarter: meta.monthOrQuarter,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await addDoc(collection(db, "clientFormTasks"), payload);
      onCreated?.();
      handleOpenChange(false);
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to attach form.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>Attach form</DialogTitle>
              <DialogDescription>
                Create the first clientFormTask for this client. Defaults come
                from the selected form&apos;s profile.
              </DialogDescription>
            </DialogHeader>

            <FormField
              control={form.control}
              name="taxFormId"
              render={() => (
                <FormItem>
                  <FormLabel>Tax form</FormLabel>
                  <Select
                    onValueChange={setSelectedFormId}
                    value={selectedFormId || undefined}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="attach-form-taxform">
                        <SelectValue placeholder="Pick a form" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {activeForms.length === 0 && (
                        <SelectItem value={NO_FORM} disabled>
                          No active forms available
                        </SelectItem>
                      )}
                      {activeForms.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.formCode} — {f.formName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="frequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Frequency</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="attach-form-frequency">
                          <SelectValue placeholder="Pick a frequency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TASK_FREQUENCIES.map((f) => (
                          <SelectItem key={f} value={f}>
                            {f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="assignedBookkeeperId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assigned bookkeeper</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || undefined}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="attach-form-bookkeeper">
                          <SelectValue placeholder="Pick a bookkeeper" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(bookkeepers?.length ?? 0) === 0 && (
                          <SelectItem value={NO_BOOKKEEPER} disabled>
                            No bookkeepers available
                          </SelectItem>
                        )}
                        {bookkeepers?.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name || b.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="periodStart"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Period start</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        data-testid="attach-form-period-start"
                        value={
                          field.value instanceof Date
                            ? toDateInputValue(field.value)
                            : ""
                        }
                        onChange={(e) =>
                          field.onChange(
                            e.target.value
                              ? new Date(`${e.target.value}T00:00:00Z`)
                              : undefined,
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="periodEnd"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Period end</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        data-testid="attach-form-period-end"
                        value={
                          field.value instanceof Date
                            ? toDateInputValue(field.value)
                            : ""
                        }
                        onChange={(e) =>
                          field.onChange(
                            e.target.value
                              ? new Date(`${e.target.value}T00:00:00Z`)
                              : undefined,
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="deadlineDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deadline</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      data-testid="attach-form-deadline"
                      value={
                        field.value instanceof Date
                          ? toDateInputValue(field.value)
                          : ""
                      }
                      onChange={(e) =>
                        field.onChange(
                          e.target.value
                            ? new Date(`${e.target.value}T00:00:00Z`)
                            : undefined,
                        )
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <textarea
                      rows={3}
                      data-testid="attach-form-notes"
                      className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      value={field.value ?? ""}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {error && (
              <div
                role="alert"
                data-testid="attach-form-error"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </div>
            )}

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
                type="submit"
                disabled={busy || !selectedFormId}
                data-testid="attach-form-submit"
              >
                {busy ? "Attaching…" : "Attach form"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
