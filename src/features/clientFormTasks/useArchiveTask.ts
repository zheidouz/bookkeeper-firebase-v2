// useArchiveTask — slice #10 (archive → atomic create next).
//
// Thin wrapper over the `archiveTask` httpsCallable. The archive write,
// the successor creation, and the audit row all happen server-side in a
// single transaction (see functions/src/archiveTask.ts); this hook just
// invokes it and surfaces the typed response so the UI can show a toast
// with the next deadline.

import { useState } from "react";
import { httpsCallable } from "firebase/functions";

import { functions } from "@/lib/firebaseConfig";

export interface ArchiveTaskArgs {
  taskId: string;
  notes?: string;
}

export interface ArchiveTaskResult {
  archivedTaskId: string;
  newTaskId: string;
  newDeadline: string; // ISO yyyy-mm-dd
}

/**
 * Call the archiveTask callable. Returns the result on success or
 * throws the callable error (code + message) on failure — the caller
 * catches and renders `message`.
 */
export async function archiveTask(
  args: ArchiveTaskArgs,
): Promise<ArchiveTaskResult> {
  const fn = httpsCallable<ArchiveTaskArgs, ArchiveTaskResult>(
    functions,
    "archiveTask",
  );
  const { data } = await fn(args);
  return data;
}

/**
 * Stateful variant for components: exposes `run`, `busy`, `error`.
 * Keeps the busy/error boilerplate out of the dialog.
 */
export function useArchiveTask() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(
    args: ArchiveTaskArgs,
  ): Promise<ArchiveTaskResult | null> {
    setBusy(true);
    setError(null);
    try {
      return await archiveTask(args);
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to archive the task.";
      setError(msg);
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { run, busy, error, setError };
}
