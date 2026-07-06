// ChangeRoleDialog — small dialog with a role <Select>. Submit calls
// assignRole. The onSnapshot listener in useUsers picks up the change.

import { useEffect, useState } from "react";

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

import { useAssignRole } from "@/features/users/useCreateUser";
import { ROLES, type UserRoleInput } from "@/lib/userSchema";
import type { Role } from "@/features/auth/roleColors";

interface ChangeRoleDialogProps {
  uid: string | null;
  currentRole: Role | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ChangeRoleDialog({
  uid,
  currentRole,
  open,
  onOpenChange,
}: ChangeRoleDialogProps) {
  const [role, setRole] = useState<Role | null>(currentRole);
  const mutation = useAssignRole();

  useEffect(() => {
    setRole(currentRole);
  }, [currentRole, open]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      mutation.reset();
      setRole(currentRole);
    }
    onOpenChange(next);
  }

  async function onSubmit() {
    if (!uid || !role) return;
    const payload: UserRoleInput = { uid, role };
    try {
      await mutation.mutateAsync(payload);
      handleOpenChange(false);
    } catch {
      // Rendered inline below.
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change role</DialogTitle>
          <DialogDescription>
            Updates the custom claim on the Auth account and the role field on
            the user&apos;s profile document.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="role-select">Role</Label>
          <Select
            value={role ?? undefined}
            onValueChange={(v) => setRole(v as Role)}
          >
            <SelectTrigger id="role-select">
              <SelectValue placeholder="Pick a role" />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {mutation.isError && (
          <div
            role="alert"
            data-testid="change-role-error"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {mutation.error?.message ?? "Failed to change role."}
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
          <Button
            type="button"
            onClick={onSubmit}
            disabled={!role || role === currentRole || mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}