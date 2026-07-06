// CreateUserDialog — shadcn Dialog + RHF + Zod.
// On success: close the dialog and surface the password-reset link in a
// copy-to-clipboard Card so the admin can paste it into an email/Slack.

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

import { useCreateUser } from "@/features/users/useCreateUser";
import { ROLES, userCreateSchema, type UserCreateInput } from "@/lib/userSchema";

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CreateUserDialog({ open, onOpenChange }: CreateUserDialogProps) {
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const mutation = useCreateUser();

  const form = useForm<UserCreateInput>({
    resolver: zodResolver(userCreateSchema),
    defaultValues: { email: "", displayName: "", role: "staff" },
  });

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Reset state when closing (after success or otherwise).
      form.reset({ email: "", displayName: "", role: "staff" });
      setResetLink(null);
      setCopyState("idle");
      mutation.reset();
    }
    onOpenChange(next);
  }

  async function onSubmit(values: UserCreateInput) {
    try {
      const result = await mutation.mutateAsync(values);
      setResetLink(result.passwordResetLink);
    } catch {
      // mutation.isError / error is rendered below; no further handling here.
    }
  }

  async function copyLink() {
    if (!resetLink) return;
    try {
      await navigator.clipboard.writeText(resetLink);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("error");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        {!resetLink ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Create user</DialogTitle>
                <DialogDescription>
                  Invite a teammate. They&apos;ll receive a one-time link to set
                  their password.
                </DialogDescription>
              </DialogHeader>

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="off"
                        placeholder="name@example.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display name</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" placeholder="Jane Smith" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pick a role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ROLES.map((r) => (
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

              {mutation.isError && (
                <div
                  role="alert"
                  data-testid="create-user-error"
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {mutation.error?.message ?? "Failed to create user."}
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? "Creating…" : "Create user"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>User created</DialogTitle>
              <DialogDescription>
                Send this one-time link to the new user so they can set their
                password. The link won&apos;t be shown again.
              </DialogDescription>
            </DialogHeader>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Password reset link</CardTitle>
                <CardDescription>
                  Click copy, then paste it into your email or chat.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <code
                  data-testid="password-reset-link"
                  className="block break-all rounded bg-muted px-3 py-2 text-xs"
                >
                  {resetLink}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyLink}
                  className="self-start"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {copyState === "copied"
                    ? "Copied"
                    : copyState === "error"
                      ? "Copy failed"
                      : "Copy"}
                </Button>
              </CardContent>
            </Card>
            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}