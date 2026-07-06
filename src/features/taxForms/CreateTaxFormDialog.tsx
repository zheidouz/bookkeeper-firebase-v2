// CreateTaxFormDialog — admin/bookkeeper shadcn Dialog + RHF + Zod.
// Submits a direct Firestore SDK write to taxForms/{formCode} with
// `seedSource: false` to mark the row as user-created (so subsequent
// seed imports won't try to clobber it on a colliding formCode).

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";

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
  TAX_FORM_CATEGORIES,
  TAX_FORM_DEADLINE_RULES,
  TAX_FORM_FREQUENCIES,
  taxFormSchema,
  type TaxFormInput,
} from "@/features/taxForms/taxFormSchema";

interface CreateTaxFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NUMBER_INPUT_PROPS = { step: 1 } as const;

export default function CreateTaxFormDialog({
  open,
  onOpenChange,
}: CreateTaxFormDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const form = useForm<TaxFormInput>({
    resolver: zodResolver(taxFormSchema),
    defaultValues: {
      formCode: "",
      formName: "",
      description: "",
      category: "VAT",
      defaultFrequency: "monthly",
      defaultDeadlineRule: "lastWorkingDayOfMonthAfterPeriod+1",
      deadlineShift: null,
      isActive: true,
    },
  });

  function handleOpenChange(next: boolean) {
    if (!next) {
      form.reset();
      setError(null);
    }
    onOpenChange(next);
  }

  async function onSubmit(values: TaxFormInput) {
    setBusy(true);
    setError(null);
    try {
      const docId = values.formCode.trim();
      const ref = doc(db, "taxForms", docId);
      await setDoc(ref, {
        formCode: values.formCode,
        formName: values.formName,
        description: values.description,
        category: values.category,
        defaultFrequency: values.defaultFrequency,
        defaultDeadlineRule: values.defaultDeadlineRule,
        deadlineShift: values.deadlineShift,
        isActive: values.isActive,
        // Mark as user-created so the seed importer leaves it alone.
        seedSource: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      handleOpenChange(false);
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to create tax form.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Create tax form</DialogTitle>
              <DialogDescription>
                Add a custom form to the library. Form code is used as the
                document id and must be unique.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="formCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Form code</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="create-taxform-code"
                        placeholder="9999-TEST"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="formName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Form name</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="create-taxform-name"
                        placeholder="Custom test form"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <textarea
                      rows={3}
                      data-testid="create-taxform-description"
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
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="create-taxform-category">
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
                control={form.control}
                name="defaultFrequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default frequency</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="create-taxform-frequency">
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
                control={form.control}
                name="defaultDeadlineRule"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deadline rule</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="create-taxform-rule">
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
                control={form.control}
                name="deadlineShift"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deadline shift (days)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...NUMBER_INPUT_PROPS}
                        data-testid="create-taxform-shift"
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

            {error && (
              <div
                role="alert"
                data-testid="create-taxform-error"
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
                data-testid="create-taxform-submit"
              >
                {busy ? "Creating…" : "Create form"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
