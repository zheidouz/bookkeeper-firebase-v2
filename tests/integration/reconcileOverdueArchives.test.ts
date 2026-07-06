/**
 * Integration tests for the slice #11 nightly reconciliation cron.
 *
 * Skipped unless `VITE_USE_EMULATOR === "true"` (set by the
 * `test:integration` npm script via firebase-tools emulators:exec).
 *
 * Coverage (per docs/issues/0010-nightly-reconciliation.md):
 *  (a) Happy path: a Done task past `deadlineDate + 7d` with no
 *      successor gets a new task created + the old task archived.
 *  (b) Idempotency: running the cron a second time on the same data
 *      creates nothing (the nextTaskId pointer check).
 *  (c) A task with `nextTaskId != null` is ignored.
 *  (d) A task that is `done` but whose `deadlineDate` is within the
 *      last 7 days is ignored.
 *  (e) The audit row written by the cron has `changedBy: "system:reconcile"`.
 *  (f) Multiple candidates in one run are processed independently.
 *
 * The cron is invoked directly via `reconcileOverdueArchives.run({...})`
 * — the Firebase emulator doesn't auto-trigger scheduled functions, so
 * the test simulates the trigger event.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setLogLevel,
  Timestamp,
  where,
} from "firebase/firestore";
import {
  initializeApp as initAdminApp,
  applicationDefault,
  deleteApp as deleteAdminApp,
  type App as AdminApp,
} from "firebase-admin/app";
import {
  getFirestore as getAdminFirestore,
  FieldValue as AdminFieldValue,
  Timestamp as AdminTimestamp,
} from "firebase-admin/firestore";
import { auth, db } from "@/lib/firebaseConfig";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { reconcileOverdueArchives } from "../../functions/src/reconcileOverdueArchives";

setLogLevel("error");

// Local uniqueSuffix helper (same pattern as the other integration tests).
const uniqueSuffix = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);

const PROJECT_ID = "demo-bookkeeper";
const TEST_PASSWORD = "test-password-123";

let adminApp: AdminApp;

const RUN_INTEGRATION = process.env.VITE_USE_EMULATOR === "true";

const describeIfEmulator = RUN_INTEGRATION ? describe : describe.skip;

describeIfEmulator(
  "reconcileOverdueArchives — emulator integration",
  () => {
    beforeAll(async () => {
      adminApp = initAdminApp(
        { projectId: PROJECT_ID, credential: applicationDefault() },
        "reconcile-test-admin",
      );
    });

    /**
     * Sign in as a fresh admin user for each test so client-side reads
     * (`getDoc` against `db`) pass firestore.rules. The Admin SDK
     * writes used to seed the task bypass rules.
     */
    async function signInAsAdmin(): Promise<string> {
      const adminEmail = `admin-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);
      const rec = await adminAuth.createUser({
        email: adminEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(rec.uid, { role: "admin" });
      await signInWithEmailAndPassword(auth, adminEmail, TEST_PASSWORD);
      return adminEmail;
    }

    afterAll(async () => {
      if (adminApp) {
        try {
          await deleteAdminApp(adminApp);
        } catch {
          /* no-op */
        }
      }
    });

    beforeEach(async () => {
      try {
        await signOut(auth);
      } catch {
        /* no-op */
      }
    });

    /** Seed a task with the given status, deadline, and nextTaskId. */
    async function seedTask(args: {
      clientId: string;
      taxFormId: string;
      formCode: string;
      formDeadlineRule:
        | "lastDayOfMonthAfterPeriod"
        | "lastWorkingDayOfMonthAfterPeriod"
        | "lastWorkingDayOfMonthAfterPeriod+1"
        | "fixedDayOfMonthAfterPeriod";
      assignedBookkeeperId: string;
      frequency: "monthly" | "quarterly" | "semi_annual" | "annual" | "custom";
      periodStart: Date;
      periodEnd: Date;
      deadlineDate: Date;
      status: "done" | "pending" | "ready_to_file" | "submitted" | "archived";
      archived: boolean;
      nextTaskId: string | null;
    }): Promise<string> {
      const adminDb = getAdminFirestore(adminApp);
      // Ensure a taxForms doc exists for the form profile lookup.
      await adminDb.doc(`taxForms/${args.taxFormId}`).set(
        {
          formCode: args.formCode,
          formName: `Test form ${args.formCode}`,
          description: "For test.",
          category: "VAT",
          defaultFrequency: args.frequency,
          defaultDeadlineRule: args.formDeadlineRule,
          deadlineShift: null,
          isActive: true,
        },
        { merge: true },
      );
      const ref = adminDb.collection("clientFormTasks").doc();
      await ref.set({
        clientId: args.clientId,
        taxFormId: args.taxFormId,
        assignedBookkeeperId: args.assignedBookkeeperId,
        frequency: args.frequency,
        periodStart: AdminTimestamp.fromDate(args.periodStart),
        periodEnd: AdminTimestamp.fromDate(args.periodEnd),
        deadlineDate: AdminTimestamp.fromDate(args.deadlineDate),
        status: args.status,
        archived: args.archived,
        nextTaskId: args.nextTaskId,
        year: args.periodStart.getUTCFullYear(),
        monthOrQuarter:
          args.frequency === "monthly"
            ? args.periodStart.getUTCMonth() + 1
            : args.frequency === "quarterly"
            ? Math.floor(args.periodStart.getUTCMonth() / 3) + 1
            : null,
        notes: "",
        createdAt: AdminFieldValue.serverTimestamp(),
        updatedAt: AdminFieldValue.serverTimestamp(),
      });
      return ref.id;
    }

    it("(a) reconciles a done task past deadlineDate + 7d", async () => {
      await signInAsAdmin();
      const bookkeeperUid = `bk-${uniqueSuffix()}`;
      const taskId = await seedTask({
        clientId: `client-${uniqueSuffix()}`,
        taxFormId: `form-${uniqueSuffix()}`,
        formCode: "RECON-FORM",
        formDeadlineRule: "lastDayOfMonthAfterPeriod",
        assignedBookkeeperId: bookkeeperUid,
        frequency: "monthly",
        // Period: Jan 2026. Deadline: Jan 31.
        periodStart: new Date("2026-01-01T00:00:00Z"),
        periodEnd: new Date("2026-01-31T23:59:59Z"),
        // Deadline 30 days in the past — well past the 7-day overdue window.
        deadlineDate: new Date("2026-01-31T00:00:00Z"),
        status: "done",
        archived: false,
        nextTaskId: null,
      });

      // Trigger the cron. The run signature is a no-arg handler, so
      // we can fire it with the standard ScheduledEvent shape.
      await reconcileOverdueArchives.run({
        scheduleTime: new Date().toISOString(),
      });

      // Old task: archived, nextTaskId set, status: archived.
      const oldTaskSnap = await getDoc(doc(db, "clientFormTasks", taskId));
      const oldTask = oldTaskSnap.data()!;
      expect(oldTask.archived).toBe(true);
      expect(oldTask.status).toBe("archived");
      expect(oldTask.nextTaskId).not.toBeNull();
      // (e) Audit row has changedBy: "system:reconcile"
      const histSnap = await getDocs(
        query(
          collection(db, "taskStatusHistory"),
          where("taskId", "==", taskId),
        ),
      );
      expect(histSnap.size).toBe(1);
      const auditRow = histSnap.docs[0].data();
      expect(auditRow.changedBy).toBe("system:reconcile");
      expect(auditRow.oldStatus).toBe("done");
      expect(auditRow.newStatus).toBe("archived");
    }, 30_000);

    it("(b) is idempotent — a second run creates nothing new", async () => {
      await signInAsAdmin();
      const bookkeeperUid = `bk-${uniqueSuffix()}`;
      const taskId = await seedTask({
        clientId: `client-${uniqueSuffix()}`,
        taxFormId: `form-${uniqueSuffix()}`,
        formCode: "IDEMPOTENT",
        formDeadlineRule: "lastDayOfMonthAfterPeriod",
        assignedBookkeeperId: bookkeeperUid,
        frequency: "quarterly",
        periodStart: new Date("2026-01-01T00:00:00Z"),
        periodEnd: new Date("2026-03-31T23:59:59Z"),
        deadlineDate: new Date("2026-03-31T00:00:00Z"),
        status: "done",
        archived: false,
        nextTaskId: null,
      });

      await reconcileOverdueArchives.run({
        scheduleTime: new Date().toISOString(),
      });
      // Run again — should be a no-op for the same task (the
      // candidate query now skips it because nextTaskId is set).
      await reconcileOverdueArchives.run({
        scheduleTime: new Date().toISOString(),
      });

      // Exactly one successor exists.
      const successors = await getDocs(
        query(
          collection(db, "clientFormTasks"),
          where("previousTaskId", "==", taskId),
        ),
      );
      expect(successors.size).toBe(1);
    }, 30_000);

    it("(c) skips a task with nextTaskId already set", async () => {
      await signInAsAdmin();
      // Pre-existing successor id — just needs to exist as a doc.
      const adminDb = getAdminFirestore(adminApp);
      const dummySuccessorId = `dummy-${uniqueSuffix()}`;
      await adminDb
        .doc(`clientFormTasks/${dummySuccessorId}`)
        .set({ status: "pending", archived: false });

      const taskId = await seedTask({
        clientId: `client-${uniqueSuffix()}`,
        taxFormId: `form-${uniqueSuffix()}`,
        formCode: "HAS-NEXT",
        formDeadlineRule: "lastDayOfMonthAfterPeriod",
        assignedBookkeeperId: "bk-x",
        frequency: "monthly",
        periodStart: new Date("2026-01-01T00:00:00Z"),
        periodEnd: new Date("2026-01-31T23:59:59Z"),
        deadlineDate: new Date("2026-01-31T00:00:00Z"),
        status: "done",
        archived: false,
        nextTaskId: dummySuccessorId,
      });

      await reconcileOverdueArchives.run({
        scheduleTime: new Date().toISOString(),
      });

      // The task was NOT modified (nextTaskId still points to the
      // dummy, archived is still false, status still "done").
      const oldTaskSnap = await getDoc(doc(db, "clientFormTasks", taskId));
      const oldTask = oldTaskSnap.data()!;
      expect(oldTask.archived).toBe(false);
      expect(oldTask.status).toBe("done");
      expect(oldTask.nextTaskId).toBe(dummySuccessorId);
    }, 30_000);

    it("(d) skips a done task whose deadline is within the last 7 days", async () => {
      await signInAsAdmin();
      const bookkeeperUid = `bk-${uniqueSuffix()}`;
      const taskId = await seedTask({
        clientId: `client-${uniqueSuffix()}`,
        taxFormId: `form-${uniqueSuffix()}`,
        formCode: "RECENT",
        formDeadlineRule: "lastDayOfMonthAfterPeriod",
        assignedBookkeeperId: bookkeeperUid,
        frequency: "monthly",
        periodStart: new Date("2026-01-01T00:00:00Z"),
        periodEnd: new Date("2026-01-31T23:59:59Z"),
        // Deadline 2 days in the past — within the 7-day window.
        deadlineDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        status: "done",
        archived: false,
        nextTaskId: null,
      });

      await reconcileOverdueArchives.run({
        scheduleTime: new Date().toISOString(),
      });

      // Task untouched.
      const oldTaskSnap = await getDoc(doc(db, "clientFormTasks", taskId));
      const oldTask = oldTaskSnap.data()!;
      expect(oldTask.archived).toBe(false);
      expect(oldTask.status).toBe("done");
      expect(oldTask.nextTaskId).toBeNull();
    }, 30_000);

    it("(f) processes multiple candidates in one run independently", async () => {
      await signInAsAdmin();
      const bookkeeperUid = `bk-${uniqueSuffix()}`;
      // Three done tasks, all overdue, all for different clients.
      const taskIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const taskId = await seedTask({
          clientId: `client-${uniqueSuffix()}-${i}`,
          taxFormId: `form-${uniqueSuffix()}-${i}`,
          formCode: `MULTI-${i}`,
          formDeadlineRule: "lastDayOfMonthAfterPeriod",
          assignedBookkeeperId: bookkeeperUid,
          frequency: "monthly",
          periodStart: new Date("2026-01-01T00:00:00Z"),
          periodEnd: new Date("2026-01-31T23:59:59Z"),
          deadlineDate: new Date("2026-01-31T00:00:00Z"),
          status: "done",
          archived: false,
          nextTaskId: null,
        });
        taskIds.push(taskId);
      }

      await reconcileOverdueArchives.run({
        scheduleTime: new Date().toISOString(),
      });

      // All three should now have nextTaskId set.
      for (const taskId of taskIds) {
        const snap = await getDoc(doc(db, "clientFormTasks", taskId));
        const data = snap.data()!;
        expect(data.archived).toBe(true);
        expect(data.nextTaskId).not.toBeNull();
      }
    }, 30_000);
  },
);
