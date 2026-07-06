// EditClientDialog — pre-filled shadcn Dialog + RHF + Zod for editing
// any client row. Submits an updateDoc on the user-editable fields;
// status flips atomically and updatedAt is bumped via serverTimestamp.

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { db } from "@/lib/firebaseConfig";
import {
  clientSchema,
  type ClientInput,
} from "@/features/clients/clientSchema";
import { useBookkeepers } from "@/features/clients/useBookkeepers";
import type { ClientRow } from "@/features/clients/useClients";

interface EditClientDialogProps {
  client: ClientRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NO_BOOKKEEPER = "__none__";

export default function EditClientDialog({
  client,
  open,
  onOpenChange,
}: EditClientDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: bookkeepers } = useBookkeepers();
  const hasBookkeepers = (bookkeepers?.length ?? 0) > 0;

  const defaultValues: ClientInput = {
    businessName: client?.businessName ?? "",
    ownerName: client?.ownerName ?? "",
    tin: client?.tin ?? "",
    rdo: client?.rdo ?? "",
    address: client?.address ?? "",
    contactNumber: client?.contactNumber ?? "",
    email: client?.email ?? "",
    assignedBookkeeperId: client?.assignedBookkeeperId ?? "",
    status: client?.status ?? "active",
    notes: client?.notes ?? "",
  };

  const reactForm = useForm<ClientInput>({
    resolver: zodResolver(clientSchema),
    defaultValues,
  });

  // Reset whenever the row changes (or the dialog opens).
  useEffect(() => {
    if (open) {
      reactForm.reset(defaultValues);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, client?.id]);

  function handleOpenChange(next: boolean) {
    if (!next) setError(null);
    onOpenChange(next);
  }

  async function onSubmit(values: ClientInput) {
    if (!client?.id) return;
    setBusy(true);
    setError(null);
    try {
      await updateDoc(doc(db, "clients", client.id), {
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
        updatedAt: serverTimestamp(),
      });
      handleOpenChange(false);
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to update client.";
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
              <DialogTitle>Edit client</DialogTitle>
              <DialogDescription>
                Update the client record. TIN and assigned bookkeeper cannot
                be empty.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={reactForm.control}
                name="businessName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business name</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="edit-client-businessName"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={reactForm.control}
                name="ownerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Owner name</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="edit-client-ownerName"
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
                control={reactForm.control}
                name="tin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>TIN</FormLabel>
                    <FormControl>
                      <Input data-testid="edit-client-tin" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={reactForm.control}
                name="rdo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>RDO code</FormLabel>
                    <FormControl>
                      <Input data-testid="edit-client-rdo" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={reactForm.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input data-testid="edit-client-address" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={reactForm.control}
                name="contactNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact number</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="edit-client-contactNumber"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={reactForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        data-testid="edit-client-email"
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
                control={reactForm.control}
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
                        <SelectTrigger data-testid="edit-client-bookkeeper">
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
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={reactForm.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="edit-client-status">
                          <SelectValue placeholder="Pick a status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={reactForm.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <textarea
                      rows={3}
                      data-testid="edit-client-notes"
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
                data-testid="edit-client-error"
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
                data-testid="edit-client-submit"
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
