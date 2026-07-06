/**
 * Integration tests for the slice #9 status workflow + audit history.
 *
 * Skipped unless `VITE_USE_EMULATOR === "true"` (set by the
 * `test:integration` npm script via firebase-tools emulators:exec).
 *
 * Covers the rules matrix in docs/issues/0008-status-workflow.md:
 *  (a) Bookkeeper moves pending → ready_to_file + history row appears
 *  (b) Bookkeeper moves ready_to_file → submitted + history row appears
 *  (c) Admin moves submitted → done + history row appears
 *  (d) pending → done direct jump is REJECTED by rules (single-document write)
 *  (e) Bookkeeper B cannot change a task assigned to Bookkeeper A
 *  (f) A different bookkeeper cannot READ the task's history (audit log)
 *  (g) history rows are append-only — update + delete are REJECTED for all roles
 *
 * The bookkeeper's `transitionTaskStatus` batched-write path is
 * imported from the production module so the test exercises the
 * same code that runs in the SPA.
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
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setLogLevel,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  writeBatch as fbWriteBatch,
  orderBy,
  addDoc,
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
  Timestamp as AdminTimestamp,
} from "firebase-admin/firestore";
import {
  IllegalStatusTransitionError,
  transitionTaskStatus,
} from "@/features/clientFormTasks/useTaskStatusTransition";

setLogLevel("error");

import { auth, db } from "@/lib/firebaseConfig";

const uniqueSuffix = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);

const RUN_INTEGRATION = process.env.VITE_USE_EMULATOR === "true";

const PROJECT_ID = "demo-bookkeeper";
const TEST_PASSWORD = "test-password-123";

let adminApp: AdminApp;

function adminTask(
  clientId: string,
  taxFormId: string,
  assignedBookkeeperId: string,
  status:
    | "pending"
    | "ready_to_file"
    | "submitted"
    | "done"
    | "archived" = "pending",
): Record<string, unknown> {
  return {
    clientId,
    taxFormId,
    assignedBookkeeperId,
    frequency: "quarterly",
    periodStart: AdminTimestamp.fromDate(new Date("2026-01-01T00:00:00Z")),
    periodEnd: AdminTimestamp.fromDate(new Date("2026-03-31T00:00:00Z")),
    deadlineDate: AdminTimestamp.fromDate(new Date("2026-04-25T00:00:00Z")),
    status,
    archived: false,
    year: 2026,
    monthOrQuarter: 1,
    notes: "",
  };
}

function makeClientInput(assignedBookkeeperId: string) {
  return {
    businessName: `StatusWf-${uniqueSuffix()}`,
    ownerName: "Jane Doe",
    tin: "123-456-789",
    rdo: "047",
    address: "123 Main St, Quezon City",
    contactNumber: "+63 917 123 4567",
    email: `status-${uniqueSuffix()}@acme.example`,
    assignedBookkeeperId,
    status: "active" as const,
    notes: "",
  };
}

(RUN_INTEGRATION ? describe : describe.skip)(
  "statusWorkflow — emulator integration",
  () => {
    beforeAll(() => {
      expect(auth).toBeDefined();
      expect(db).toBeDefined();

      process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
      process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
      process.env.GCLOUD_PROJECT = PROJECT_ID;
      adminApp = initAdminApp(
        { projectId: PROJECT_ID, credential: applicationDefault() },
        "statusworkflow-test-admin",
      );
    }, 10_000);

    afterAll(async () => {
      if (adminApp) {
        try {
          await deleteAdminApp(adminApp);
        } catch {
          /* already gone */
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

    async function seedClientAndForm(): Promise<{
      clientId: string;
      taxFormId: string;
    }> {
      const adminFirestore = getAdminFirestore(adminApp);
      const clientRef = await adminFirestore
        .collection("clients")
        .add(makeClientInput("placeholder"));
      const formRef = await adminFirestore.collection("taxForms").add({
        formCode: "2550Q",
        formName: "Quarterly VAT Return",
        description: "Quarterly VAT",
        category: "VAT",
        defaultFrequency: "quarterly",
        defaultDeadlineRule: "lastDayOfMonthAfterPeriod",
        deadlineShift: null,
        isActive: true,
        seedSource: true,
      });
      return { clientId: clientRef.id, taxFormId: formRef.id };
    }

    async function cleanupTask(clientId: string, taskId: string) {
      const adminFirestore = getAdminFirestore(adminApp);
      try {
        // History rows — query the admin SDK
        const history = await adminFirestore
          .collection("taskStatusHistory")
          .where("taskId", "==", taskId)
          .get();
        await Promise.all(history.docs.map((d) => d.ref.delete()));
      } catch {
        /* no-op */
      }
      await adminFirestore
        .doc(`clientFormTasks/${taskId}`)
        .delete()
        .catch(() => undefined);
      await adminFirestore
        .doc(`clients/${clientId}`)
        .delete()
        .catch(() => undefined);
    }

    it("(a) bookkeeper transitions pending → ready_to_file and appends a history row", async () => {
      const bkEmail = `bk-a-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);
      const adminFirestore = getAdminFirestore(adminApp);

      const bkRec = await adminAuth.createUser({
        email: bkEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(bkRec.uid, {
        role: "bookkeeper",
      });

      const { clientId, taxFormId } = await seedClientAndForm();
      const taskRef = await adminFirestore
        .collection("clientFormTasks")
        .add(adminTask(clientId, taxFormId, bkRec.uid, "pending"));
      const taskId = taskRef.id;

      try {
        await signInWithEmailAndPassword(auth, bkEmail, TEST_PASSWORD);
        await transitionTaskStatus({
          taskId,
          fromStatus: "pending",
          toStatus: "ready_to_file",
          changedBy: bkRec.uid,
          notes: "starting Q1",
        });

        const taskSnap = await getDoc(
          doc(db, "clientFormTasks", taskId),
        );
        expect(taskSnap.data()?.status).toBe("ready_to_file");

        const historySnap = await adminFirestore
          .collection("taskStatusHistory")
          .where("taskId", "==", taskId)
          .get();
        expect(historySnap.size).toBe(1);
        const row = historySnap.docs[0].data();
        expect(row.taskId).toBe(taskId);
        expect(row.oldStatus).toBe("pending");
        expect(row.newStatus).toBe("ready_to_file");
        expect(row.changedBy).toBe(bkRec.uid);
        expect(row.notes).toBe("starting Q1");
        expect(row.changedAt).toBeDefined();
      } finally {
        await signOut(auth);
        await adminAuth.deleteUser(bkRec.uid);
        await cleanupTask(clientId, taskId);
      }
    }, 60_000);

    it("(b) bookkeeper transitions ready_to_file → submitted and appends a second history row", async () => {
      const bkEmail = `bk-b-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);
      const adminFirestore = getAdminFirestore(adminApp);

      const bkRec = await adminAuth.createUser({
        email: bkEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(bkRec.uid, {
        role: "bookkeeper",
      });

      const { clientId, taxFormId } = await seedClientAndForm();
      const taskRef = await adminFirestore
        .collection("clientFormTasks")
        .add(
          adminTask(
            clientId,
            taxFormId,
            bkRec.uid,
            "ready_to_file",
          ),
        );
      const taskId = taskRef.id;

      try {
        await signInWithEmailAndPassword(auth, bkEmail, TEST_PASSWORD);
        await transitionTaskStatus({
          taskId,
          fromStatus: "ready_to_file",
          toStatus: "submitted",
          changedBy: bkRec.uid,
        });

        const taskSnap = await getDoc(
          doc(db, "clientFormTasks", taskId),
        );
        expect(taskSnap.data()?.status).toBe("submitted");

        const historySnap = await adminFirestore
          .collection("taskStatusHistory")
          .where("taskId", "==", taskId)
          .get();
        expect(historySnap.size).toBe(1);
        expect(historySnap.docs[0].data().newStatus).toBe("submitted");
        expect(historySnap.docs[0].data().oldStatus).toBe(
          "ready_to_file",
        );
      } finally {
        await signOut(auth);
        await adminAuth.deleteUser(bkRec.uid);
        await cleanupTask(clientId, taskId);
      }
    }, 60_000);

    it("(c) admin transitions submitted → done and appends a history row", async () => {
      const adminEmail = `admin-c-${uniqueSuffix()}@example.com`;
      const bkEmail = `bk-c-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);
      const adminFirestore = getAdminFirestore(adminApp);

      const adminRec = await adminAuth.createUser({
        email: adminEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(adminRec.uid, { role: "admin" });
      const bkRec = await adminAuth.createUser({
        email: bkEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(bkRec.uid, {
        role: "bookkeeper",
      });

      const { clientId, taxFormId } = await seedClientAndForm();
      const taskRef = await adminFirestore
        .collection("clientFormTasks")
        .add(adminTask(clientId, taxFormId, bkRec.uid, "submitted"));
      const taskId = taskRef.id;

      try {
        await signInWithEmailAndPassword(auth, adminEmail, TEST_PASSWORD);
        await transitionTaskStatus({
          taskId,
          fromStatus: "submitted",
          toStatus: "done",
          changedBy: adminRec.uid,
          notes: "BIR accepted",
        });

        const taskSnap = await getDoc(
          doc(db, "clientFormTasks", taskId),
        );
        expect(taskSnap.data()?.status).toBe("done");

        const historySnap = await adminFirestore
          .collection("taskStatusHistory")
          .where("taskId", "==", taskId)
          .get();
        expect(historySnap.size).toBe(1);
        expect(historySnap.docs[0].data().newStatus).toBe("done");
        expect(historySnap.docs[0].data().changedBy).toBe(adminRec.uid);
      } finally {
        await signOut(auth);
        await adminAuth.deleteUser(adminRec.uid);
        await adminAuth.deleteUser(bkRec.uid);
        await cleanupTask(clientId, taskId);
      }
    }, 60_000);

    it("(d) pending → done direct jump is rejected by rules", async () => {
      const bkEmail = `bk-d-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);
      const adminFirestore = getAdminFirestore(adminApp);

      const bkRec = await adminAuth.createUser({
        email: bkEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(bkRec.uid, {
        role: "bookkeeper",
      });

      const { clientId, taxFormId } = await seedClientAndForm();
      const taskRef = await adminFirestore
        .collection("clientFormTasks")
        .add(adminTask(clientId, taxFormId, bkRec.uid, "pending"));
      const taskId = taskRef.id;

      try {
        await signInWithEmailAndPassword(auth, bkEmail, TEST_PASSWORD);
        // The function-level guard catches it before any write is
        // opened (it never hits the rules). Use a raw update to
        // exercise the rule itself.
        await expect(
          updateDoc(doc(db, "clientFormTasks", taskId), {
            status: "done",
            updatedAt: serverTimestamp(),
          }),
        ).rejects.toThrow();

        // Also confirm the function-level guard.
        await expect(
          transitionTaskStatus({
            taskId,
            fromStatus: "pending",
            toStatus: "done",
            changedBy: bkRec.uid,
          }),
        ).rejects.toBeInstanceOf(IllegalStatusTransitionError);

        const taskSnap = await adminFirestore
          .doc(`clientFormTasks/${taskId}`)
          .get();
        expect(taskSnap.data()?.status).toBe("pending");

        const historySnap = await adminFirestore
          .collection("taskStatusHistory")
          .where("taskId", "==", taskId)
          .get();
        expect(historySnap.size).toBe(0);
      } finally {
        await signOut(auth);
        await adminAuth.deleteUser(bkRec.uid);
        await cleanupTask(clientId, taskId);
      }
    }, 60_000);

    it("(e) bookkeeper B cannot change a task assigned to bookkeeper A", async () => {
      const bkAEmail = `bkA-e-${uniqueSuffix()}@example.com`;
      const bkBEmail = `bkB-e-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);
      const adminFirestore = getAdminFirestore(adminApp);

      const bkARec = await adminAuth.createUser({
        email: bkAEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(bkARec.uid, {
        role: "bookkeeper",
      });
      const bkBRec = await adminAuth.createUser({
        email: bkBEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(bkBRec.uid, {
        role: "bookkeeper",
      });

      const { clientId, taxFormId } = await seedClientAndForm();
      const taskRef = await adminFirestore
        .collection("clientFormTasks")
        .add(adminTask(clientId, taxFormId, bkARec.uid, "pending"));
      const taskId = taskRef.id;

      try {
        await signInWithEmailAndPassword(auth, bkBEmail, TEST_PASSWORD);
        // Batched path: the rules layer rejects because bkB is not
        // the assigned bookkeeper. The function-level guard also
        // rejects illegal transitions, so to specifically test the
        // assignment gate we issue a NOTES-ONLY bump (legal at the
        // reducer layer, blocked at the rules layer).
        await expect(
          updateDoc(doc(db, "clientFormTasks", taskId), {
            notes: "B tried this",
            updatedAt: serverTimestamp(),
          }),
        ).rejects.toThrow();
      } finally {
        await signOut(auth);
        await adminAuth.deleteUser(bkARec.uid);
        await adminAuth.deleteUser(bkBRec.uid);
        await cleanupTask(clientId, taskId);
      }
    }, 60_000);

    it("(f) another bookkeeper cannot READ the assigned-task's history (rules deny)", async () => {
      const bkAEmail = `bkA-f-${uniqueSuffix()}@example.com`;
      const bkBEmail = `bkB-f-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);
      const adminFirestore = getAdminFirestore(adminApp);

      const bkARec = await adminAuth.createUser({
        email: bkAEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(bkARec.uid, {
        role: "bookkeeper",
      });
      const bkBRec = await adminAuth.createUser({
        email: bkBEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(bkBRec.uid, {
        role: "bookkeeper",
      });

      const { clientId, taxFormId } = await seedClientAndForm();
      const taskRef = await adminFirestore
        .collection("clientFormTasks")
        .add(adminTask(clientId, taxFormId, bkARec.uid, "pending"));
      const taskId = taskRef.id;

      // Seed one history row via admin so the row is in the DB.
      await adminFirestore.collection("taskStatusHistory").add({
        taskId,
        oldStatus: "pending",
        newStatus: "ready_to_file",
        changedBy: bkARec.uid,
        changedAt: AdminTimestamp.now(),
        notes: "seed",
      });
      const historyId = (
        await adminFirestore
          .collection("taskStatusHistory")
          .where("taskId", "==", taskId)
          .get()
      ).docs[0].id;

      try {
        await signInWithEmailAndPassword(auth, bkBEmail, TEST_PASSWORD);
        await expect(
          getDoc(doc(db, "taskStatusHistory", historyId)),
        ).rejects.toThrow();

        // And the LIST query — bookkeeper B is not allowed to read
        // the task's history list (rules deny).
        await expect(
          getDocs(
            query(
              collection(db, "taskStatusHistory"),
              where("taskId", "==", taskId),
            ),
          ),
        ).rejects.toThrow();
      } finally {
        await signOut(auth);
        await adminAuth.deleteUser(bkARec.uid);
        await adminAuth.deleteUser(bkBRec.uid);
        await cleanupTask(clientId, taskId);
      }
    }, 60_000);

    it("(g) history rows are append-only — update + delete denied for any role", async () => {
      const bkEmail = `bk-g-${uniqueSuffix()}@example.com`;
      const adminEmail = `admin-g-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);
      const adminFirestore = getAdminFirestore(adminApp);

      const bkRec = await adminAuth.createUser({
        email: bkEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(bkRec.uid, {
        role: "bookkeeper",
      });
      const adminRec = await adminAuth.createUser({
        email: adminEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(adminRec.uid, { role: "admin" });

      const { clientId, taxFormId } = await seedClientAndForm();
      const taskRef = await adminFirestore
        .collection("clientFormTasks")
        .add(adminTask(clientId, taxFormId, bkRec.uid, "pending"));
      const taskId = taskRef.id;

      try {
        // Bookkeeper creates a history row via the standard
        // batched-write path. This requires running through the
        // production code so the auth state is the bookkeeper's.
        await signInWithEmailAndPassword(auth, bkEmail, TEST_PASSWORD);
        await transitionTaskStatus({
          taskId,
          fromStatus: "pending",
          toStatus: "ready_to_file",
          changedBy: bkRec.uid,
        });
        await signOut(auth);

        const historyId = (
          await adminFirestore
            .collection("taskStatusHistory")
            .where("taskId", "==", taskId)
            .get()
        ).docs[0].id;

        // Try as the assigned bookkeeper — both update and delete are denied.
        await signInWithEmailAndPassword(auth, bkEmail, TEST_PASSWORD);
        await expect(
          updateDoc(doc(db, "taskStatusHistory", historyId), {
            notes: "tampered",
          }),
        ).rejects.toThrow();
        await expect(
          getDoc(doc(db, "taskStatusHistory", historyId)).then(() =>
            deleteDoc(doc(db, "taskStatusHistory", historyId)),
          ),
        ).rejects.toThrow();
        await signOut(auth);

        // Try as admin — also denied.
        await signInWithEmailAndPassword(
          auth,
          adminEmail,
          TEST_PASSWORD,
        );
        await expect(
          updateDoc(doc(db, "taskStatusHistory", historyId), {
            notes: "tampered-by-admin",
          }),
        ).rejects.toThrow();
        await expect(
          deleteDoc(doc(db, "taskStatusHistory", historyId)),
        ).rejects.toThrow();
      } finally {
        await signOut(auth);
        await adminAuth.deleteUser(bkRec.uid);
        await adminAuth.deleteUser(adminRec.uid);
        await cleanupTask(clientId, taskId);
      }
    }, 90_000);
  },
);

// Silences unused-import linter for surface symbols we don't
// reference directly but keep imported via the real path in case a
// future refactor pulls them back in.
void fbWriteBatch;
void addDoc;
void orderBy;
void Timestamp;
