// NewClientDialog — shadcn Dialog + RHF + Zod. Submits a direct
// Firestore SDK write with auto-id. The bookkeeper dropdown pulls
// from useBookkeepers(); when the list is empty (no bookkeeper users
// yet), the field is disabled with a hint to create one first.

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

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
  CLIENT_STATUSES,
  clientSchema,
  type ClientInput,
} from "@/features/clients/clientSchema";
import { useBookkeepers } from "@/features/clients/useBookkeepers";

interface NewClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NO_BOOKKEEPER = "__none__";

export default function NewClientDialog({
  open,
  onOpenChange,
}: NewClientDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: bookkeepers } = useBookkeepers();
  const hasBookkeepers = (bookkeepers?.length ?? 0) > 0;

  const form = useForm<ClientInput>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      businessName: "",
      ownerName: "",
      tin: "",
      rdo: "",
      address: "",
      contactNumber: "",
      email: "",
      assignedBookkeeperId: "",
      status: "active",
      notes: "",
    },
  });

  function handleOpenChange(next: boolean) {
    if (!next) {
      form.reset();
      setError(null);
    }
    onOpenChange(next);
  }

  async function onSubmit(values: ClientInput) {
    setBusy(true);
    setError(null);
    try {
      await addDoc(collection(db, "clients"), {
        businessName: values.businessName,
        ownerName: values.ownerName,
        tin: values.tin,
        rdo: values.rdo,
        address: values.address,
        contactNumber: values.contactNumber,
        email: values.email,
        assignedBookkeeperId: values.assignedBookkeeperId,
        status: values.status,
        notes: values.notes ?? "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      handleOpenChange(false);
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to create client.";
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
              <DialogTitle>New client</DialogTitle>
              <DialogDescription>
                Add a new client. TIN and assigned bookkeeper are required.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="businessName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business name</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="create-client-businessName"
                        placeholder="Acme Trading Co."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ownerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Owner name</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="create-client-ownerName"
                        placeholder="Jane Doe"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="tin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>TIN</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="create-client-tin"
                        placeholder="123-456-789 or 123-456-789-000"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rdo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>RDO code</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="create-client-rdo"
                        placeholder="047"
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
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input
                      data-testid="create-client-address"
                      placeholder="123 Main St, Quezon City"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="contactNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact number</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="create-client-contactNumber"
                        placeholder="+63 917 123 4567"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        data-testid="create-client-email"
                        placeholder="contact@acme.example"
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
              name="assignedBookkeeperId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Assigned bookkeeper</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value || undefined}
                    value={field.value || undefined}
                    disabled={!hasBookkeepers}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="create-client-bookkeeper">
                        <SelectValue placeholder="Pick a bookkeeper" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {!hasBookkeepers && (
                        <SelectItem value={NO_BOOKKEEPER} disabled>
                          No bookkeepers yet
                        </SelectItem>
                      )}
                      {bookkeepers?.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name || b.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!hasBookkeepers && (
                    <p
                      className="text-xs text-amber-600"
                      data-testid="create-client-no-bookkeepers"
                    >
                      Create a bookkeeper user first via /users.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <textarea
                      rows={3}
                      data-testid="create-client-notes"
                      placeholder="Anything the bookkeeper should know…"
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
                data-testid="create-client-error"
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
                disabled={busy || !hasBookkeepers}
                data-testid="create-client-submit"
              >
                {busy ? "Creating…" : "Create client"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// Keep CLIENT_STATUSES referenced so the import isn't tree-shaken
// before any future status filter call site lands here.
void CLIENT_STATUSES;
