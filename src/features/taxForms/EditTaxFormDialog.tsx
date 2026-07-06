// EditTaxFormDialog — pre-filled shadcn Dialog + RHF + Zod for editing
// any tax-form row. Submits an updateDoc with the user-editable fields
// (NOT seedSource, NOT createdAt; updatedAt bumped via serverTimestamp).

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";

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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { db } from "@/lib/firebaseConfig";
import {
  TAX_FORM_CATEGORIES,
  TAX_FORM_DEADLINE_RULES,
  TAX_FORM_FREQUENCIES,
  taxFormSchema,
  type TaxFormInput,
} from "@/features/taxForms/taxFormSchema";
import type { TaxFormRow } from "@/features/taxForms/useTaxForms";

interface EditTaxFormDialogProps {
  form: TaxFormRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NUMBER_INPUT_PROPS = { step: 1 } as const;

export default function EditTaxFormDialog({
  form,
  open,
  onOpenChange,
}: EditTaxFormDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const defaultValues: TaxFormInput = {
    formCode: form?.formCode ?? "",
    formName: form?.formName ?? "",
    description: form?.description ?? "",
    category: form?.category ?? "VAT",
    defaultFrequency: form?.defaultFrequency ?? "monthly",
    defaultDeadlineRule:
      form?.defaultDeadlineRule ?? "lastWorkingDayOfMonthAfterPeriod+1",
    deadlineShift: form?.deadlineShift ?? null,
    isActive: form?.isActive ?? true,
  };

  const reactForm = useForm<TaxFormInput>({
    resolver: zodResolver(taxFormSchema),
    defaultValues,
  });

  // Reset whenever the row changes (or the dialog opens).
  useEffect(() => {
    if (open) {
      reactForm.reset(defaultValues);
      setError(null);
    }
    // Intentionally exclude defaultValues / reactForm — only re-run on
    // open changes or when the row itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form?.id]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setError(null);
    }
    onOpenChange(next);
  }

  async function onSubmit(values: TaxFormInput) {
    if (!form?.id) return;
    setBusy(true);
    setError(null);
    try {
      const ref = doc(db, "taxForms", form.id);
      await updateDoc(ref, {
        formCode: values.formCode,
        formName: values.formName,
        description: values.description,
        category: values.category,
        defaultFrequency: values.defaultFrequency,
        defaultDeadlineRule: values.defaultDeadlineRule,
        deadlineShift: values.deadlineShift,
        isActive: values.isActive,
        updatedAt: serverTimestamp(),
      });
      handleOpenChange(false);
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to save changes.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <Form {...reactForm}>
          <form
            onSubmit={reactForm.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>Edit tax form</DialogTitle>
              <DialogDescription>
                Update the fields below. Created-on and seed-source are
                preserved on save.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={reactForm.control}
                name="formCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Form code</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="edit-taxform-code"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={reactForm.control}
                name="formName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Form name</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="edit-taxform-name"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={reactForm.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <textarea
                      rows={3}
                      data-testid="edit-taxform-description"
                      placeholder="Short summary for the bookkeeper..."
                      className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      value={field.value ?? ""}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={reactForm.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="edit-taxform-category">
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TAX_FORM_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={reactForm.control}
                name="defaultFrequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default frequency</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="edit-taxform-frequency">
                          <SelectValue placeholder="Frequency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TAX_FORM_FREQUENCIES.map((f) => (
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={reactForm.control}
                name="defaultDeadlineRule"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deadline rule</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="edit-taxform-rule">
                          <SelectValue placeholder="Rule" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TAX_FORM_DEADLINE_RULES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={reactForm.control}
                name="deadlineShift"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deadline shift (days)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...NUMBER_INPUT_PROPS}
                        data-testid="edit-taxform-shift"
                        value={
                          typeof field.value === "number"
                            ? String(field.value)
                            : ""
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          field.onChange(v === "" ? null : Number(v));
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex items-center gap-2">
              <FormField
                control={reactForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <input
                        id={`edit-taxform-active-${form?.id ?? "x"}`}
                        type="checkbox"
                        checked={!!field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300"
                        data-testid="edit-taxform-active"
                      />
                    </FormControl>
                    <Label htmlFor={`edit-taxform-active-${form?.id ?? "x"}`}>
                      Active (visible to active selectors)
                    </Label>
                  </FormItem>
                )}
              />
            </div>

            {error && (
              <div
                role="alert"
                data-testid="edit-taxform-error"
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
                data-testid="edit-taxform-submit"
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
