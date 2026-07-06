// useTaskStatusTransition — slice #9 (status workflow + audit history).
//
// Batched-write path for advancing a clientFormTask through its
// legal status workflow. Writes two things atomically:
//
//   1. clientFormTasks/{taskId}        → { status: toStatus, updatedAt }
//   2. taskStatusHistory/{auto-id}     → full audit row
//
// Uses `writeBatch` (not `runTransaction`) because both writes are
// independent — neither needs to read the other before committing.
//
// The reducer is consulted BEFORE the batch is opened so an illegal
// transition throws without ever hitting Firestore.

import {
  collection,
  doc,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

import { db } from "@/lib/firebaseConfig";
import type { TaskStatus } from "@/features/clientFormTasks/clientFormTaskSchema";
import { isLegalTransition } from "@/features/clientFormTasks/statusReducer";

export interface TransitionTaskStatusArgs {
  taskId: string;
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  changedBy: string; // auth.uid
  notes?: string;
}

export interface TaskStatusHistoryRow {
  id?: string;
  taskId: string;
  oldStatus: TaskStatus;
  newStatus: TaskStatus;
  changedBy: string;
  changedAt: ReturnType<typeof serverTimestamp>;
  notes: string;
}

export class IllegalStatusTransitionError extends Error {
  constructor(from: TaskStatus, to: TaskStatus) {
    super(`Illegal status transition: ${from} → ${to}`);
    this.name = "IllegalStatusTransitionError";
  }
}

/**
 * Commit a status transition + audit history row atomically.
 *
 * Throws `IllegalStatusTransitionError` if the requested move is not
 * a legal workflow step. Callers should catch and surface the message
 * to the UI rather than treating it as a generic failure.
 *
 * The function accepts an optional `firestore` argument purely to
 * make unit testing the batched-write behaviour easy — production
 * callers omit it and use the default `db` from `firebaseConfig`.
 */
export async function transitionTaskStatus(
  args: TransitionTaskStatusArgs,
  firestore: Firestore = db,
): Promise<void> {
  if (!isLegalTransition(args.fromStatus, args.toStatus)) {
    throw new IllegalStatusTransitionError(args.fromStatus, args.toStatus);
  }

  const taskRef = doc(firestore, "clientFormTasks", args.taskId);
  // `doc(collection(...))` produces an auto-id document reference
  // without writing it — `batch.set` then commits the new row.
  const historyRef = doc(collection(firestore, "taskStatusHistory"));

  const batch = writeBatch(firestore);
  batch.update(taskRef, {
    status: args.toStatus,
    updatedAt: serverTimestamp(),
  });
  batch.set(historyRef, {
    taskId: args.taskId,
    oldStatus: args.fromStatus,
    newStatus: args.toStatus,
    changedBy: args.changedBy,
    changedAt: serverTimestamp(),
    notes: args.notes ?? "",
  });

  await batch.commit();
}
