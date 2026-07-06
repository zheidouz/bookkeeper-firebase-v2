// functions/src/reconcileOverdueArchives.ts
//
// Scheduled Cloud Function (Functions v2, onSchedule): runs every day at
// 02:00 in asia-southeast1. Finds Done tasks whose deadlineDate + 7 days
// has passed with no successor, and creates the next-period task using
// the same buildNextTask helper as the archiveTask callable. Idempotent
// because the nextTaskId pointer check means a second run picks up
// nothing new.
//
// Per ADR-001 ("Hybrid: callable Cloud Function on Archive, AND a
// nightly cron reconciles"), this is the safety-net half. The
// callable is the primary path; this cron catches:
//   - Dropped writes (network blip during a manual archive)
//   - Admin overrides that bypass the UI
//   - Future bugs that prevent the callable from creating the successor
//
// Audit row goes into `taskStatusHistory` with changedBy =
// "system:reconcile" so dashboards can distinguish cron-driven vs
// user-driven archives.

import { onSchedule } from "firebase-functions/v2/scheduler";
import { initializeApp, getApps } from "firebase-admin/app";
import {
  getFirestore,
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";
import {
  buildNextTask,
  type CurrentTaskInput,
  type FormDeadlineProfile,
} from "./lib/nextTask.js";

if (getApps().length === 0) {
  initializeApp();
}

const RECONCILE_CRON_DEFAULT = "0 2 * * *";
const RECONCILE_TIMEZONE_DEFAULT = "Asia/Manila";
const SYSTEM_USER = "system:reconcile";
const OVERDUE_DAYS = 7;
const OVERDUE_MS = OVERDUE_DAYS * 24 * 60 * 60 * 1000;

async function loadHolidaysForYear(
  db: FirebaseFirestore.Firestore,
  year: number,
): Promise<Set<string>> {
  const snap = await db.doc(`birHolidays/${year}`).get();
  if (!snap.exists) return new Set();
  const days = snap.get("days");
  if (!Array.isArray(days)) return new Set();
  return new Set(days.filter((d): d is string => typeof d === "string"));
}

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

async function loadHolidaysForRange(
  db: FirebaseFirestore.Firestore,
  startYear: number,
  endYear: number,
): Promise<Set<string>> {
  const set = new Set<string>();
  for (let y = startYear; y <= endYear; y++) {
    const part = await loadHolidaysForYear(db, y);
    part.forEach((d) => set.add(d));
  }
  return set;
}

export const reconcileOverdueArchives = onSchedule(
  {
    schedule: process.env.RECONCILE_CRON ?? RECONCILE_CRON_DEFAULT,
    timeZone: process.env.RECONCILE_TIMEZONE ?? RECONCILE_TIMEZONE_DEFAULT,
    // Region comes from the global setGlobalOptions in index.ts
    // (firebase-functions/v2 schedules inherit the global region).
  },
  async (): Promise<void> => {
    const db = getFirestore();
    const now = Date.now();
    const cutoffMs = now - OVERDUE_MS;
    const cutoffTs = Timestamp.fromMillis(cutoffMs);

    // Find candidates: done + not archived + no successor + deadline in
    // the past by more than 7 days. The "no successor" condition is
    // equivalent to `nextTaskId == null` (the archive callable always
    // sets nextTaskId). Limit to 200 to bound the run.
    const candidatesSnap = await db
      .collection("clientFormTasks")
      .where("status", "==", "done")
      .where("archived", "==", false)
      .where("nextTaskId", "==", null)
      .where("deadlineDate", "<", cutoffTs)
      .limit(200)
      .get();

    const summary = {
      scanned: candidatesSnap.size,
      reconciled: 0,
      skipped: 0,
      errors: 0,
    };

    for (const candidateDoc of candidatesSnap.docs) {
      try {
        const candidate = candidateDoc.data() as Record<string, unknown>;
        const taskId = candidateDoc.id;

        // Bookkeeper assignment (required for the successor to keep
        // its assignment).
        const assignedBookkeeperId = String(
          candidate.assignedBookkeeperId ?? "",
        );
        if (!assignedBookkeeperId) {
          summary.skipped++;
          continue;
        }

        // Frequency check — `custom` has no deterministic next period.
        const frequency = candidate.frequency as
          | "monthly"
          | "quarterly"
          | "semi_annual"
          | "annual"
          | "custom";
        if (frequency === "custom") {
          summary.skipped++;
          continue;
        }

        const periodStart = toDate(candidate.periodStart);
        const periodEnd = toDate(candidate.periodEnd);
        if (!periodStart || !periodEnd) {
          summary.skipped++;
          continue;
        }

        const clientId = String(candidate.clientId ?? "");
        const taxFormId = String(candidate.taxFormId ?? "");
        if (!clientId || !taxFormId) {
          summary.skipped++;
          continue;
        }

        // Load the attached form's deadline profile.
        const formSnap = await db.doc(`taxForms/${taxFormId}`).get();
        if (!formSnap.exists) {
          summary.skipped++;
          continue;
        }
        const form = formSnap.data() as Record<string, unknown>;
        const formProfile: FormDeadlineProfile = {
          formCode: String(form.formCode ?? ""),
          defaultDeadlineRule:
            (form.defaultDeadlineRule as
              | "lastDayOfMonthAfterPeriod"
              | "lastWorkingDayOfMonthAfterPeriod"
              | "lastWorkingDayOfMonthAfterPeriod+1"
              | "fixedDayOfMonthAfterPeriod") ?? "lastDayOfMonthAfterPeriod",
          deadlineShift:
            form.deadlineShift == null ? null : Number(form.deadlineShift),
        };

        const current: CurrentTaskInput = {
          clientId,
          taxFormId,
          assignedBookkeeperId,
          frequency,
          periodStart,
          periodEnd,
        };

        // Two-pass for the right year of holidays (period year may
        // differ from deadline year).
        const provisional = buildNextTask(current, formProfile, new Set());
        if (!provisional) {
          summary.skipped++;
          continue;
        }
        const holidays = await loadHolidaysForRange(
          db,
          provisional.periodEnd.getUTCFullYear(),
          provisional.deadlineDate.getUTCFullYear(),
        );
        const nextFields = buildNextTask(current, formProfile, holidays);
        if (!nextFields) {
          summary.skipped++;
          continue;
        }

        // Run the same write pattern as archiveTask: a transaction
        // that re-reads inside, checks the duplicate guard, writes the
        // successor + marks the candidate archived + appends an audit
        // row. If anything is off (concurrent archive, missing form,
        // status changed by an admin), the catch catches and we
        // record a skip or error without aborting the whole run.
        const newTaskRef = db.collection("clientFormTasks").doc();
        const historyRef = db.collection("taskStatusHistory").doc();

        try {
          await db.runTransaction(async (tx) => {
            const fresh = await tx.get(candidateDoc.ref);
            if (!fresh.exists) {
              throw new Error("Candidate disappeared");
            }
            const freshData = fresh.data() as Record<string, unknown>;
            if (
              freshData.status !== "done" ||
              freshData.archived === true ||
              freshData.nextTaskId != null
            ) {
              // Either manually archived since we scanned, or a
              // duplicate-guard hit. Skip silently.
              throw new Error("skip: state changed");
            }

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
              throw new Error("skip: duplicate");
            }

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
            tx.update(candidateDoc.ref, {
              status: "archived",
              archived: true,
              archivedAt: FieldValue.serverTimestamp(),
              archivedBy: SYSTEM_USER,
              nextTaskId: newTaskRef.id,
              updatedAt: FieldValue.serverTimestamp(),
            });
            tx.set(historyRef, {
              taskId,
              oldStatus: "done",
              newStatus: "archived",
              changedBy: SYSTEM_USER,
              changedAt: FieldValue.serverTimestamp(),
              notes: "nightly reconciliation",
            });
          });
          summary.reconciled++;
        } catch (err) {
          // Most catch paths are intentional skips (state changed,
          // duplicate). Only count as error if it looks like a real
          // failure.
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.startsWith("skip:")) {
            summary.skipped++;
          } else {
            console.error(`reconcile error for ${taskId}:`, err);
            summary.errors++;
          }
        }
      } catch (outerErr) {
        // Catastrophic per-candidate error (e.g. an unexpected
        // throw). Don't abort the whole run.
        console.error("reconcile outer error:", outerErr);
        summary.errors++;
      }
    }

    console.log(
      `reconcileOverdueArchives: scanned=${summary.scanned} reconciled=${summary.reconciled} skipped=${summary.skipped} errors=${summary.errors}`,
    );
  },
);
