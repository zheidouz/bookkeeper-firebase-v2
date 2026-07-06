// EditTaskDialog — slice #8. Edit a pending clientFormTask. The
// caller is responsible for ensuring the task is editable (status
// === 'pending' AND the current user is admin OR the assigned
// bookkeeper). The button is hidden by the row component when the
// task is not editable; this dialog still renders the form so the
// caller controls the policy.
//
// On submit, updateDoc the doc with the new field values, then bump
// updatedAt via serverTimestamp.

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { doc, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";

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
  clientFormTaskInputSchema,
  TASK_FREQUENCIES,
  type ClientFormTaskInput,
} from "@/features/clientFormTasks/clientFormTaskSchema";
import type { ClientFormTaskRow } from "@/features/clientFormTasks/useClientFormTasks";
import { useBookkeepers } from "@/features/clients/useBookkeepers";

interface EditTaskDialogProps {
  task: ClientFormTaskRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

const NO_BOOKKEEPER = "__no_bookkeeper__";

function toDateInputValue(d: Date | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export default function EditTaskDialog({
  task,
  open,
  onOpenChange,
  onSaved,
}: EditTaskDialogProps) {
  const { data: bookkeepers } = useBookkeepers();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const defaultValues: ClientFormTaskInput = {
    clientId: task?.clientId ?? "",
    taxFormId: task?.taxFormId ?? "",
    assignedBookkeeperId: task?.assignedBookkeeperId ?? "",
    frequency: task?.frequency ?? "monthly",
    periodStart: task?.periodStart ?? new Date(),
    periodEnd: task?.periodEnd ?? new Date(),
    deadlineDate: task?.deadlineDate ?? new Date(),
    status: task?.status ?? "pending",
    archived: task?.archived ?? false,
    notes: task?.notes ?? "",
  };

  const form = useForm<ClientFormTaskInput>({
    resolver: zodResolver(clientFormTaskInputSchema),
    defaultValues,
  });

  useEffect(() => {
    if (open) {
      form.reset(defaultValues);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  function handleOpenChange(next: boolean) {
    if (!next) setError(null);
    onOpenChange(next);
  }

  async function onSubmit(values: ClientFormTaskInput) {
    if (!task?.id) return;
    setBusy(true);
    setError(null);
    try {
      await updateDoc(doc(db, "clientFormTasks", task.id), {
        taxFormId: values.taxFormId,
        assignedBookkeeperId: values.assignedBookkeeperId,
        frequency: values.frequency,
        periodStart: Timestamp.fromDate(values.periodStart),
        periodEnd: Timestamp.fromDate(values.periodEnd),
        deadlineDate: Timestamp.fromDate(values.deadlineDate),
        status: values.status,
        archived: values.archived,
        notes: values.notes ?? "",
        updatedAt: serverTimestamp(),
      });
      onSaved?.();
      handleOpenChange(false);
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to update task.";
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
              <DialogTitle>Edit task</DialogTitle>
              <DialogDescription>
                Update the task. Only pending tasks can be edited; non-pending
                tasks are managed by the status workflow.
              </DialogDescription>
            </DialogHeader>

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
                        <SelectTrigger data-testid="edit-task-frequency">
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
                        <SelectTrigger data-testid="edit-task-bookkeeper">
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
                        data-testid="edit-task-period-start"
                        value={toDateInputValue(
                          field.value instanceof Date
                            ? field.value
                            : undefined,
                        )}
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
                        data-testid="edit-task-period-end"
                        value={toDateInputValue(
                          field.value instanceof Date
                            ? field.value
                            : undefined,
                        )}
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
                      data-testid="edit-task-deadline"
                      value={toDateInputValue(
                        field.value instanceof Date
                          ? field.value
                          : undefined,
                      )}
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
                      data-testid="edit-task-notes"
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
                data-testid="edit-task-error"
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
                disabled={busy}
                data-testid="edit-task-submit"
              >
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
