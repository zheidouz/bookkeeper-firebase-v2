// ConfirmDialog — slice #18.
//
// Replaces `window.confirm()` (slice #14 issue) with a styled
// shadcn/Radix dialog. Used by every destructive action: Delete
// task, Delete client, Archive task, Disable user, Unlink tax
// form, etc.
//
// Usage:
//   <ConfirmDialog
//     open={open}
//     onOpenChange={setOpen}
//     title="Delete this pending task?"
//     description="The task doc and its audit-history row will be
//                  removed. The next task in the recurrence is NOT
//                  affected."
//     actionLabel="Delete task"
//     actionVariant="destructive"
//     onConfirm={async () => { await deleteDoc(...); setOpen(false); }}
//   />
//
// `onConfirm` may return a Promise — the confirm button stays in a
// disabled "Working…" state until it resolves; on rejection, the
// dialog stays open and surfaces the error inline.

import { useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  /** Label on the primary action button. Default: "Confirm". */
  actionLabel?: string;
  /** Default cancel label. Default: "Cancel". */
  cancelLabel?: string;
  /** Button variant. Default: "destructive" for safety. */
  actionVariant?:
    | "destructive"
    | "default"
    | "outline"
    | "secondary"
    | "ghost";
  /** Called when the user confirms. May be async. */
  onConfirm: () => void | Promise<void>;
  /** Test-id hook for Playwright / vitest. */
  testId?: string;
}

export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  actionLabel = "Confirm",
  cancelLabel = "Cancel",
  actionVariant = "destructive",
  onConfirm,
  testId = "confirm-dialog",
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Action failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (busy) return; // block dismiss during async work
        onOpenChange(next);
      }}
    >
      <DialogContent data-testid={testId}>
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div
              className="mt-1 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-rose-50"
              aria-hidden
            >
              <AlertTriangle className="h-4 w-4 text-rose-600" />
            </div>
            <div className="flex-1">
              <DialogTitle data-testid="confirm-dialog-title">
                {title}
              </DialogTitle>
              {description ? (
                <DialogDescription
                  data-testid="confirm-dialog-description"
                  className="mt-2"
                >
                  {description}
                </DialogDescription>
              ) : null}
            </div>
          </div>
        </DialogHeader>
        {error ? (
          <div
            className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
            data-testid="confirm-dialog-error"
          >
            {error}
          </div>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            data-testid="confirm-dialog-cancel"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={actionVariant}
            onClick={handleConfirm}
            disabled={busy}
            data-testid="confirm-dialog-confirm"
          >
            {busy ? "Working…" : actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
