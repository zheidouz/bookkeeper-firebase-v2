/**
 * Integration tests for the slice #10 archiveTask callable.
 *
 * Skipped unless `VITE_USE_EMULATOR === "true"` (set by the
 * `test:integration` npm script via firebase-tools emulators:exec).
 *
 * Coverage (per docs/issues/0009-archive-callable.md):
 *  (a) Happy path: admin archives a done task → new task created with
 *      correct fields, old task has archived:true + nextTaskId,
 *      audit row created (oldStatus:done, newStatus:archived).
 *  (b) Attempting to archive a non-done task → failed-precondition.
 *  (c) Non-assigned bookkeeper tries to archive → permission-denied.
 *  (d) Double-archive (two parallel callables) → one succeeds, the
 *      other returns already-exists.
 *  (e) After archive, the old task's status transitions done → archived.
 *  (f) Next-period math: monthly → next month, quarterly → next quarter.
 *  (g) The new task's previousTaskId matches the old task's id.
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
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import {
  getFirestore as getAdminFirestore,
  FieldValue as AdminFieldValue,
  Timestamp as AdminTimestamp,
} from "firebase-admin/firestore";
import { auth, db, functions } from "@/lib/firebaseConfig";
import { httpsCallable } from "firebase/functions";

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

describeIfEmulator("archiveTask — emulator integration", () => {
  beforeAll(async () => {
    adminApp = initAdminApp(
      { projectId: PROJECT_ID, credential: applicationDefault() },
      "archive-task-test-admin",
    );
  });

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

  /** Seed a `done` task for the given bookkeeper + client + form. */
  async function seedDoneTask(args: {
    bookkeeperUid: string;
    bookkeeperEmail: string;
    clientId: string;
    taxFormId: string;
    formCode: string;
    frequency: "monthly" | "quarterly" | "semi_annual" | "annual";
    periodStart: Date;
    periodEnd: Date;
  }): Promise<string> {
    const adminAuth = getAdminAuth(adminApp);
    const adminDb = getAdminFirestore(adminApp);

    // Ensure a taxForms doc exists for the defaultDeadlineRule lookup.
    await adminDb.doc(`taxForms/${args.taxFormId}`).set(
      {
        formCode: args.formCode,
        formName: `Test form ${args.formCode}`,
        description: "For test.",
        category: "VAT",
        defaultFrequency: args.frequency,
        defaultDeadlineRule: "lastDayOfMonthAfterPeriod",
        deadlineShift: null,
        isActive: true,
      },
      { merge: true },
    );

    const taskRef = adminDb.collection("clientFormTasks").doc();
    await taskRef.set({
      clientId: args.clientId,
      taxFormId: args.taxFormId,
      assignedBookkeeperId: args.bookkeeperUid,
      frequency: args.frequency,
      periodStart: AdminTimestamp.fromDate(args.periodStart),
      periodEnd: AdminTimestamp.fromDate(args.periodEnd),
      deadlineDate: AdminTimestamp.fromDate(args.periodEnd),
      status: "done",
      archived: false,
      notes: "",
      year: args.periodStart.getUTCFullYear(),
      monthOrQuarter:
        args.frequency === "monthly"
          ? args.periodStart.getUTCMonth() + 1
          : args.frequency === "quarterly"
          ? Math.floor(args.periodStart.getUTCMonth() / 3) + 1
          : null,
      createdAt: AdminFieldValue.serverTimestamp(),
      updatedAt: AdminFieldValue.serverTimestamp(),
    });
    return taskRef.id;
  }

  it("(a) admin archives a done task — happy path", async () => {
    const adminEmail = `admin-${uniqueSuffix()}@example.com`;
    const bookkeeperEmail = `bk-${uniqueSuffix()}@example.com`;
    const adminAuth = getAdminAuth(adminApp);
    const adminDb = getAdminFirestore(adminApp);

    const adminRec = await adminAuth.createUser({
      email: adminEmail,
      password: TEST_PASSWORD,
    });
    await adminAuth.setCustomUserClaims(adminRec.uid, { role: "admin" });

    const bkRec = await adminAuth.createUser({
      email: bookkeeperEmail,
      password: TEST_PASSWORD,
    });
    await adminAuth.setCustomUserClaims(bkRec.uid, { role: "bookkeeper" });

    try {
      const taskId = await seedDoneTask({
        bookkeeperUid: bkRec.uid,
        bookkeeperEmail,
        clientId: `client-${uniqueSuffix()}`,
        taxFormId: `form-${uniqueSuffix()}`,
        formCode: "TEST-FORM",
        frequency: "monthly",
        periodStart: new Date("2026-01-01T00:00:00Z"),
        periodEnd: new Date("2026-01-31T23:59:59Z"),
      });

      await signInWithEmailAndPassword(auth, adminEmail, TEST_PASSWORD);

      const fn = httpsCallable<
        { taskId: string; notes?: string },
        { archivedTaskId: string; newTaskId: string; newDeadline: string }
      >(functions, "archiveTask");
      const { data } = await fn({ taskId, notes: "Filed OK" });

      // (g) New task's previousTaskId matches the old task's id.
      const newTaskSnap = await getDoc(doc(db, "clientFormTasks", data.newTaskId));
      expect(newTaskSnap.exists()).toBe(true);
      const newTask = newTaskSnap.data()!;
      expect(newTask.previousTaskId).toBe(taskId);
      expect(newTask.status).toBe("pending");
      expect(newTask.archived).toBe(false);
      expect(newTask.clientId).toMatch(/^client-/);

      // Old task: archived=true, status=archived, nextTaskId points to new.
      const oldTaskSnap = await getDoc(doc(db, "clientFormTasks", taskId));
      expect(oldTaskSnap.exists()).toBe(true);
      const oldTask = oldTaskSnap.data()!;
      expect(oldTask.archived).toBe(true);
      // (e) Status transitions done → archived.
      expect(oldTask.status).toBe("archived");
      expect(oldTask.nextTaskId).toBe(data.newTaskId);
      expect(oldTask.archivedBy).toBe(adminRec.uid);

      // (a) Audit row created.
      const histSnap = await getDocs(
        query(
          collection(db, "taskStatusHistory"),
          where("taskId", "==", taskId),
        ),
      );
      expect(histSnap.size).toBeGreaterThanOrEqual(1);
      const auditRow = histSnap.docs[0].data();
      expect(auditRow.oldStatus).toBe("done");
      expect(auditRow.newStatus).toBe("archived");
      expect(auditRow.changedBy).toBe(adminRec.uid);
      expect(auditRow.notes).toBe("Filed OK");
    } finally {
      await signOut(auth);
      await adminAuth.deleteUser(adminRec.uid);
      await adminAuth.deleteUser(bkRec.uid);
    }
  }, 30_000);

  it("(b) refuses to archive a non-done task", async () => {
    const adminEmail = `admin-${uniqueSuffix()}@example.com`;
    const bookkeeperEmail = `bk-${uniqueSuffix()}@example.com`;
    const adminAuth = getAdminAuth(adminApp);
    const adminDb = getAdminFirestore(adminApp);

    const adminRec = await adminAuth.createUser({
      email: adminEmail,
      password: TEST_PASSWORD,
    });
    await adminAuth.setCustomUserClaims(adminRec.uid, { role: "admin" });
    const bkRec = await adminAuth.createUser({
      email: bookkeeperEmail,
      password: TEST_PASSWORD,
    });
    await adminAuth.setCustomUserClaims(bkRec.uid, { role: "bookkeeper" });

    try {
      // Seed a task with status = "pending" (not done).
      const taskId = await seedDoneTask({
        bookkeeperUid: bkRec.uid,
        bookkeeperEmail,
        clientId: `client-${uniqueSuffix()}`,
        taxFormId: `form-${uniqueSuffix()}`,
        formCode: "PEND-FORM",
        frequency: "monthly",
        periodStart: new Date("2026-02-01T00:00:00Z"),
        periodEnd: new Date("2026-02-28T23:59:59Z"),
      });
      // Override status to "pending".
      await adminDb
        .doc(`clientFormTasks/${taskId}`)
        .update({ status: "pending" });

      await signInWithEmailAndPassword(auth, adminEmail, TEST_PASSWORD);
      const fn = httpsCallable(functions, "archiveTask");
      await expect(fn({ taskId })).rejects.toThrow(/Only a task in the 'done' status/i);
    } finally {
      await signOut(auth);
      await adminAuth.deleteUser(adminRec.uid);
      await adminAuth.deleteUser(bkRec.uid);
    }
  }, 30_000);

  it("(c) non-assigned bookkeeper is denied", async () => {
    const bookkeeperAEmail = `bkA-${uniqueSuffix()}@example.com`;
    const bookkeeperBEmail = `bkB-${uniqueSuffix()}@example.com`;
    const adminAuth = getAdminAuth(adminApp);

    const bkARec = await adminAuth.createUser({
      email: bookkeeperAEmail,
      password: TEST_PASSWORD,
    });
    await adminAuth.setCustomUserClaims(bkARec.uid, { role: "bookkeeper" });
    const bkBRec = await adminAuth.createUser({
      email: bookkeeperBEmail,
      password: TEST_PASSWORD,
    });
    await adminAuth.setCustomUserClaims(bkBRec.uid, { role: "bookkeeper" });

    try {
      const taskId = await seedDoneTask({
        bookkeeperUid: bkARec.uid,
        bookkeeperEmail: bookkeeperAEmail,
        clientId: `client-${uniqueSuffix()}`,
        taxFormId: `form-${uniqueSuffix()}`,
        formCode: "DENY-FORM",
        frequency: "quarterly",
        periodStart: new Date("2026-01-01T00:00:00Z"),
        periodEnd: new Date("2026-03-31T23:59:59Z"),
      });

      // Sign in as bookkeeper B and try to archive bookkeeper A's task.
      await signInWithEmailAndPassword(auth, bookkeeperBEmail, TEST_PASSWORD);
      const fn = httpsCallable(functions, "archiveTask");
      await expect(fn({ taskId })).rejects.toThrow(
        /Only the assigned bookkeeper or an admin/i,
      );
    } finally {
      await signOut(auth);
      await adminAuth.deleteUser(bkARec.uid);
      await adminAuth.deleteUser(bkBRec.uid);
    }
  }, 30_000);

  it("(d) double-archive via two parallel callables is rejected", async () => {
    const adminEmail = `admin-${uniqueSuffix()}@example.com`;
    const bookkeeperEmail = `bk-${uniqueSuffix()}@example.com`;
    const adminAuth = getAdminAuth(adminApp);
    const adminDb = getAdminFirestore(adminApp);

    const adminRec = await adminAuth.createUser({
      email: adminEmail,
      password: TEST_PASSWORD,
    });
    await adminAuth.setCustomUserClaims(adminRec.uid, { role: "admin" });
    const bkRec = await adminAuth.createUser({
      email: bookkeeperEmail,
      password: TEST_PASSWORD,
    });
    await adminAuth.setCustomUserClaims(bkRec.uid, { role: "bookkeeper" });

    try {
      const taskId = await seedDoneTask({
        bookkeeperUid: bkRec.uid,
        bookkeeperEmail,
        clientId: `client-${uniqueSuffix()}`,
        taxFormId: `form-${uniqueSuffix()}`,
        formCode: "RACE-FORM",
        frequency: "monthly",
        periodStart: new Date("2026-03-01T00:00:00Z"),
        periodEnd: new Date("2026-03-31T23:59:59Z"),
      });

      await signInWithEmailAndPassword(auth, adminEmail, TEST_PASSWORD);
      const fn = httpsCallable(functions, "archiveTask");
      // Fire two in parallel.
      const results = await Promise.allSettled([fn({ taskId }), fn({ taskId })]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      // One succeeds, the other is rejected (either by done→archived
      // race or by duplicate-guard).
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
    } finally {
      await signOut(auth);
      await adminAuth.deleteUser(adminRec.uid);
      await adminAuth.deleteUser(bkRec.uid);
    }
  }, 45_000);

  it("(f) next-period math: monthly → next month", async () => {
    const adminEmail = `admin-${uniqueSuffix()}@example.com`;
    const bookkeeperEmail = `bk-${uniqueSuffix()}@example.com`;
    const adminAuth = getAdminAuth(adminApp);

    const adminRec = await adminAuth.createUser({
      email: adminEmail,
      password: TEST_PASSWORD,
    });
    await adminAuth.setCustomUserClaims(adminRec.uid, { role: "admin" });
    const bkRec = await adminAuth.createUser({
      email: bookkeeperEmail,
      password: TEST_PASSWORD,
    });
    await adminAuth.setCustomUserClaims(bkRec.uid, { role: "bookkeeper" });

    try {
      const taskId = await seedDoneTask({
        bookkeeperUid: bkRec.uid,
        bookkeeperEmail,
        clientId: `client-${uniqueSuffix()}`,
        taxFormId: `form-${uniqueSuffix()}`,
        formCode: "MONTH-FORM",
        frequency: "monthly",
        periodStart: new Date("2026-01-01T00:00:00Z"),
        periodEnd: new Date("2026-01-31T23:59:59Z"),
      });

      await signInWithEmailAndPassword(auth, adminEmail, TEST_PASSWORD);
      const fn = httpsCallable<
        { taskId: string },
        { archivedTaskId: string; newTaskId: string; newDeadline: string }
      >(functions, "archiveTask");
      const { data } = await fn({ taskId });

      const newTaskSnap = await getDoc(doc(db, "clientFormTasks", data.newTaskId));
      const newTask = newTaskSnap.data()!;
      const newStart = (newTask.periodStart as Timestamp).toDate();
      const newEnd = (newTask.periodEnd as Timestamp).toDate();
      // Monthly: Feb 2026. periodStart = 2026-02-01, periodEnd = 2026-02-28.
      expect(newStart.toISOString().slice(0, 10)).toBe("2026-02-01");
      expect(newEnd.toISOString().slice(0, 10)).toBe("2026-02-28");
    } finally {
      await signOut(auth);
      await adminAuth.deleteUser(adminRec.uid);
      await adminAuth.deleteUser(bkRec.uid);
    }
  }, 30_000);

  it("(f) next-period math: quarterly → next quarter", async () => {
    const adminEmail = `admin-${uniqueSuffix()}@example.com`;
    const bookkeeperEmail = `bk-${uniqueSuffix()}@example.com`;
    const adminAuth = getAdminAuth(adminApp);

    const adminRec = await adminAuth.createUser({
      email: adminEmail,
      password: TEST_PASSWORD,
    });
    await adminAuth.setCustomUserClaims(adminRec.uid, { role: "admin" });
    const bkRec = await adminAuth.createUser({
      email: bookkeeperEmail,
      password: TEST_PASSWORD,
    });
    await adminAuth.setCustomUserClaims(bkRec.uid, { role: "bookkeeper" });

    try {
      const taskId = await seedDoneTask({
        bookkeeperUid: bkRec.uid,
        bookkeeperEmail,
        clientId: `client-${uniqueSuffix()}`,
        taxFormId: `form-${uniqueSuffix()}`,
        formCode: "QTR-FORM",
        frequency: "quarterly",
        periodStart: new Date("2026-01-01T00:00:00Z"),
        periodEnd: new Date("2026-03-31T23:59:59Z"),
      });

      await signInWithEmailAndPassword(auth, adminEmail, TEST_PASSWORD);
      const fn = httpsCallable<
        { taskId: string },
        { archivedTaskId: string; newTaskId: string; newDeadline: string }
      >(functions, "archiveTask");
      const { data } = await fn({ taskId });

      const newTaskSnap = await getDoc(doc(db, "clientFormTasks", data.newTaskId));
      const newTask = newTaskSnap.data()!;
      const newStart = (newTask.periodStart as Timestamp).toDate();
      const newEnd = (newTask.periodEnd as Timestamp).toDate();
      // Q1 → Q2: 2026-04-01 → 2026-06-30.
      expect(newStart.toISOString().slice(0, 10)).toBe("2026-04-01");
      expect(newEnd.toISOString().slice(0, 10)).toBe("2026-06-30");
    } finally {
      await signOut(auth);
      await adminAuth.deleteUser(adminRec.uid);
      await adminAuth.deleteUser(bkRec.uid);
    }
  }, 30_000);
});
