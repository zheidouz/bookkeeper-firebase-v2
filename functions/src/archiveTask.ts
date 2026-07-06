// Cloud Function: archiveTask
//
// Callable. Archives a `done` clientFormTask and atomically creates the
// next period's `pending` task for the same client + form. Per ADR-001
// this is the on-demand half of the hybrid archive strategy (the
// nightly reconciliation function is slice #10's companion).
//
// Authorization: only the bookkeeper assigned to the task, or an admin,
// may archive it. This is enforced here (not in rules) because the
// `archived` field is off-limits to client-direct writes (see
// firestore.rules — clients cannot set archived:true / status=archived).
//
// The archive write, the successor creation, and the taskStatusHistory
// row all happen inside a single Firestore transaction so a dropped
// connection can never leave a Done task without a successor, nor a
// successor without the back-pointer.

import {
  onCall,
  HttpsError,
  type CallableRequest,
} from "firebase-functions/v2/https";
import { initializeApp, getApps } from "firebase-admin/app";
import {
  getFirestore,
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";

import { archiveTaskSchema, type ArchiveTaskInput } from "./zodSchemas.js";
import type { Frequency, DeadlineRule } from "./lib/deadline.js";
import { buildNextTask } from "./lib/nextTask.js";

// Emulator runtime requires explicit init (see adminCreateUser.ts).
if (!getApps().length) {
  initializeApp();
}

interface ArchiveTaskResponse {
  archivedTaskId: string;
  newTaskId: string;
  newDeadline: string; // ISO yyyy-mm-dd of the successor's deadline
}

/** Coerce a Firestore value that should be a Date into one (UTC). */
function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/** Load the holiday set for a given year from `birHolidays/{year}`. */
async function loadHolidays(
  db: FirebaseFirestore.Firestore,
  year: number,
): Promise<Set<string>> {
  const snap = await db.doc(`birHolidays/${year}`).get();
  if (!snap.exists) return new Set();
  const days = snap.get("days");
  if (!Array.isArray(days)) return new Set();
  return new Set(days.filter((d): d is string => typeof d === "string"));
}

export const archiveTask = onCall(
  { region: "asia-southeast1" },
  async (
    request: CallableRequest<ArchiveTaskInput>,
  ): Promise<ArchiveTaskResponse> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to archive a task.");
    }

    const parsed = archiveTaskSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError(
        "invalid-argument",
        parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      );
    }
    const { taskId, notes } = parsed.data;
    const uid = request.auth.uid;
    const isAdmin = request.auth.token.role === "admin";

    const db = getFirestore();
    const taskRef = db.doc(`clientFormTasks/${taskId}`);

    // Read the current task + form profile BEFORE opening the
    // transaction so we can (a) authorize, (b) reject non-done /
    // already-archived tasks, and (c) load the holiday set for the
    // successor's deadline year. The transaction re-reads the task to
    // stay correct under concurrent archives.
    const preSnap = await taskRef.get();
    if (!preSnap.exists) {
      throw new HttpsError("not-found", "Task not found.");
    }
    const task = preSnap.data() as Record<string, unknown>;

    const assignedBookkeeperId = String(task.assignedBookkeeperId ?? "");
    if (!isAdmin && uid !== assignedBookkeeperId) {
      throw new HttpsError(
        "permission-denied",
        "Only the assigned bookkeeper or an admin can archive this task.",
      );
    }

    if (task.status !== "done") {
      throw new HttpsError(
        "failed-precondition",
        "Only a task in the 'done' status can be archived.",
      );
    }
    if (task.archived === true) {
      throw new HttpsError(
        "failed-precondition",
        "This task is already archived.",
      );
    }

    const periodStart = toDate(task.periodStart);
    const periodEnd = toDate(task.periodEnd);
    if (!periodStart || !periodEnd) {
      throw new HttpsError(
        "failed-precondition",
        "Task is missing a valid period; cannot roll forward.",
      );
    }

    const frequency = task.frequency as Frequency;
    const clientId = String(task.clientId ?? "");
    const taxFormId = String(task.taxFormId ?? "");

    // Load the attached form's deadline profile.
    const formSnap = await db.doc(`taxForms/${taxFormId}`).get();
    if (!formSnap.exists) {
      throw new HttpsError(
        "failed-precondition",
        "The attached tax form no longer exists.",
      );
    }
    const form = formSnap.data() as Record<string, unknown>;
    const formProfile = {
      formCode: String(form.formCode ?? ""),
      defaultDeadlineRule:
        (form.defaultDeadlineRule as DeadlineRule) ??
        "lastDayOfMonthAfterPeriod",
      deadlineShift:
        form.deadlineShift == null ? null : Number(form.deadlineShift),
    };

    // Compute the successor's fields. `custom` frequency has no
    // deterministic next period → refuse.
    const period = { periodStart, periodEnd };

    // We need the successor period first to know which year's holidays
    // to load. buildNextTask needs holidays, so do a cheap two-pass:
    // build once with an empty set to learn the deadline year, then
    // rebuild with the real holiday set. The period math is holiday-
    // independent, so the periods are identical across the two passes.
    const provisional = buildNextTask(
      {
        clientId,
        taxFormId,
        assignedBookkeeperId,
        frequency,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
      },
      formProfile,
      new Set(),
    );
    if (!provisional) {
      throw new HttpsError(
        "failed-precondition",
        "This task's frequency is 'custom'; the next period must be created manually.",
      );
    }

    const yearsToLoad = new Set<number>([
      provisional.periodEnd.getUTCFullYear(),
      provisional.deadlineDate.getUTCFullYear(),
    ]);
    const holidays = new Set<string>();
    for (const y of Array.from(yearsToLoad)) {
      const set = await loadHolidays(db, y);
      set.forEach((d) => holidays.add(d));
    }

    const nextFields = buildNextTask(
      {
        clientId,
        taxFormId,
        assignedBookkeeperId,
        frequency,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
      },
      formProfile,
      holidays,
    );
    // buildNextTask already returned non-null above for the same input;
    // this second call cannot be null. Guard for the type-checker.
    if (!nextFields) {
      throw new HttpsError(
        "internal",
        "Failed to compute the next period's task.",
      );
    }

    const newTaskRef = db.collection("clientFormTasks").doc();
    const historyRef = db.collection("taskStatusHistory").doc();

    try {
      await db.runTransaction(async (tx) => {
        // Re-read inside the transaction so two racing archives can't
        // both pass the done/!archived checks (the loser sees the
        // winner's write and aborts).
        const fresh = await tx.get(taskRef);
        if (!fresh.exists) {
          throw new HttpsError("not-found", "Task not found.");
        }
        const freshData = fresh.data() as Record<string, unknown>;
        if (freshData.status !== "done" || freshData.archived === true) {
          throw new HttpsError(
            "failed-precondition",
            "Task is no longer archivable (already archived or status changed).",
          );
        }

        // Duplicate guard (PRD story 38): refuse if a task already
        // exists for (clientId, taxFormId, nextPeriodStart). A manual
        // double-archive or a reconciliation race is caught here.
        const dupQuery = db
          .collection("clientFormTasks")
          .where("clientId", "==", clientId)
          .where("taxFormId", "==", taxFormId)
          .where(
            "periodStart",
            "==",
            Timestamp.fromDate(nextFields.periodStart),
          );
        const dupSnap = await tx.get(dupQuery);
        if (!dupSnap.empty) {
          throw new HttpsError(
            "already-exists",
            "A task for the next period already exists.",
          );
        }

        // (a) create the successor
        tx.set(newTaskRef, {
          ...nextFields,
          periodStart: Timestamp.fromDate(nextFields.periodStart),
          periodEnd: Timestamp.fromDate(nextFields.periodEnd),
          deadlineDate: Timestamp.fromDate(nextFields.deadlineDate),
          previousTaskId: taskId,
          nextTaskId: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // (b) archive the current task + link forward
        tx.update(taskRef, {
          status: "archived",
          archived: true,
          archivedAt: FieldValue.serverTimestamp(),
          archivedBy: uid,
          nextTaskId: newTaskRef.id,
          updatedAt: FieldValue.serverTimestamp(),
        });

        // (c) one audit row for the done → archived transition
        tx.set(historyRef, {
          taskId,
          oldStatus: "done",
          newStatus: "archived",
          changedBy: uid,
          changedAt: FieldValue.serverTimestamp(),
          notes: notes ?? "",
        });
      });
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to archive the task.";
      throw new HttpsError("internal", message);
    }

    return {
      archivedTaskId: taskId,
      newTaskId: newTaskRef.id,
      newDeadline: nextFields.deadlineDate.toISOString().slice(0, 10),
    };
  },
);
