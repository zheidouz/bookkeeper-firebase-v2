/**
 * Integration tests for clientFormTasks (slice #8).
 *
 * Skipped unless `VITE_USE_EMULATOR === "true"` (set by the
 * `test:integration` npm script via firebase-tools emulators:exec).
 *
 * Strategy: seed admin + bookkeeper A + bookkeeper B + a client + 2
 * tax forms via Admin SDK. Each `it` signs in via the client SDK
 * (using setCustomUserClaims on the Admin side) and writes / reads
 * through Firestore under the slice #8 rules. Asserts success or
 * permission-denied per the rules matrix in docs/issues/0006-attach-form-to-client.md.
 *
 * Covers:
 *  - admin creates a task → success
 *  - bookkeeper A creates a task → success
 *  - staff creates a task → rules denial
 *  - bookkeeper A updates own pending task → success
 *  - bookkeeper B updates A's pending task → rules denial
 *  - admin deletes any task → success
 *  - bookkeeper A deletes own pending task → success
 *  - bookkeeper A deletes a `done` task → rules denial
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setLogLevel,
  Timestamp,
  updateDoc,
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

interface ValidTask {
  clientId: string;
  taxFormId: string;
  assignedBookkeeperId: string;
  frequency: "monthly" | "quarterly" | "semi_annual" | "annual" | "custom";
  periodStart: Timestamp;
  periodEnd: Timestamp;
  deadlineDate: Timestamp;
  status:
    | "pending"
    | "ready_to_file"
    | "submitted"
    | "done"
    | "archived";
  archived: boolean;
  year: number;
  monthOrQuarter: number | null;
  notes: string;
}

function adminTask(
  clientId: string,
  taxFormId: string,
  assignedBookkeeperId: string,
  status: ValidTask["status"] = "pending",
): Record<string, unknown> {
  // Mirrors makeTask but uses Admin SDK Timestamps so the pre-seed
  // add() round-trips through the Admin SDK serializer (the Admin
  // SDK refuses a client-SDK Timestamp instance). Returns a loose
  // record because Admin Timestamp lacks the client-side toJSON.
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
    notes: "Q1 VAT",
  };
}

function makeTask(
  clientId: string,
  taxFormId: string,
  assignedBookkeeperId: string,
  status: ValidTask["status"] = "pending",
): ValidTask {
  return {
    clientId,
    taxFormId,
    assignedBookkeeperId,
    frequency: "quarterly",
    periodStart: Timestamp.fromDate(new Date("2026-01-01T00:00:00Z")),
    periodEnd: Timestamp.fromDate(new Date("2026-03-31T00:00:00Z")),
    deadlineDate: Timestamp.fromDate(new Date("2026-04-25T00:00:00Z")),
    status,
    archived: false,
    year: 2026,
    monthOrQuarter: 1,
    notes: "Q1 VAT",
  };
}

function makeClientInput(assignedBookkeeperId: string) {
  return {
    businessName: `Acme-${uniqueSuffix()}`,
    ownerName: "Jane Doe",
    tin: "123-456-789",
    rdo: "047",
    address: "123 Main St, Quezon City",
    contactNumber: "+63 917 123 4567",
    email: `contact-${uniqueSuffix()}@acme.example`,
    assignedBookkeeperId,
    status: "active" as const,
    notes: "VIP client",
  };
}

(RUN_INTEGRATION ? describe : describe.skip)(
  "clientFormTasks — emulator integration",
  () => {
    beforeAll(() => {
      expect(auth).toBeDefined();
      expect(db).toBeDefined();

      process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
      process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
      process.env.GCLOUD_PROJECT = PROJECT_ID;
      adminApp = initAdminApp(
        { projectId: PROJECT_ID, credential: applicationDefault() },
        "clientformtasks-test-admin",
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

    it("admin can create a task and re-read it", async () => {
      const adminEmail = `admin-${uniqueSuffix()}@example.com`;
      const bkEmail = `bk-${uniqueSuffix()}@example.com`;
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
      await adminAuth.setCustomUserClaims(bkRec.uid, { role: "bookkeeper" });

      // Admin pre-seeds a client + tax form so the task has valid refs.
      const clientRef = await adminFirestore
        .collection("clients")
        .add(makeClientInput(bkRec.uid));
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
      const clientId = clientRef.id;
      const taxFormId = formRef.id;

      try {
        await signInWithEmailAndPassword(auth, adminEmail, TEST_PASSWORD);

        const data = makeTask(clientId, taxFormId, bkRec.uid);
        const ref = await addDoc(collection(db, "clientFormTasks"), {
          ...data,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        const snap = await getDoc(ref);
        expect(snap.exists()).toBe(true);
        const got = snap.data();
        expect(got.clientId).toBe(clientId);
        expect(got.taxFormId).toBe(taxFormId);
        expect(got.assignedBookkeeperId).toBe(bkRec.uid);
        expect(got.status).toBe("pending");
        expect(got.archived).toBe(false);
        expect(got.year).toBe(2026);
        expect(got.monthOrQuarter).toBe(1);
      } finally {
        await signOut(auth);
        await adminFirestore
          .doc(`clients/${clientId}`)
          .delete()
          .catch(() => undefined);
        await adminFirestore.doc(`taxForms/${taxFormId}`).delete().catch(() => undefined);
        await adminAuth.deleteUser(adminRec.uid);
        await adminAuth.deleteUser(bkRec.uid);
      }
    }, 60_000);

    it("bookkeeper can create a task for an assigned client", async () => {
      const bkEmail = `bk-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);
      const adminFirestore = getAdminFirestore(adminApp);

      const bkRec = await adminAuth.createUser({
        email: bkEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(bkRec.uid, { role: "bookkeeper" });

      const clientRef = await adminFirestore
        .collection("clients")
        .add(makeClientInput(bkRec.uid));
      const formRef = await adminFirestore.collection("taxForms").add({
        formCode: "1601C",
        formName: "Withholding Tax — Compensation",
        description: "Monthly",
        category: "Withholding",
        defaultFrequency: "monthly",
        defaultDeadlineRule: "fixedDayOfMonthAfterPeriod",
        deadlineShift: 10,
        isActive: true,
        seedSource: true,
      });
      const clientId = clientRef.id;
      const taxFormId = formRef.id;

      try {
        await signInWithEmailAndPassword(auth, bkEmail, TEST_PASSWORD);
        const ref = await addDoc(
          collection(db, "clientFormTasks"),
          makeTask(clientId, taxFormId, bkRec.uid),
        );
        const snap = await getDoc(ref);
        expect(snap.exists()).toBe(true);
      } finally {
        await signOut(auth);
        await adminFirestore
          .doc(`clients/${clientId}`)
          .delete()
          .catch(() => undefined);
        await adminFirestore
          .doc(`taxForms/${taxFormId}`)
          .delete()
          .catch(() => undefined);
        await adminAuth.deleteUser(bkRec.uid);
      }
    }, 60_000);

    it("staff cannot create a task (rules deny)", async () => {
      const staffEmail = `staff-${uniqueSuffix()}@example.com`;
      const bkEmail = `bk-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);
      const adminFirestore = getAdminFirestore(adminApp);

      const staffRec = await adminAuth.createUser({
        email: staffEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(staffRec.uid, { role: "staff" });

      const bkRec = await adminAuth.createUser({
        email: bkEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(bkRec.uid, { role: "bookkeeper" });

      const clientRef = await adminFirestore
        .collection("clients")
        .add(makeClientInput(bkRec.uid));
      const formRef = await adminFirestore.collection("taxForms").add({
        formCode: "1601C",
        formName: "Withholding Tax — Compensation",
        description: "Monthly",
        category: "Withholding",
        defaultFrequency: "monthly",
        defaultDeadlineRule: "fixedDayOfMonthAfterPeriod",
        deadlineShift: 10,
        isActive: true,
        seedSource: true,
      });
      const clientId = clientRef.id;
      const taxFormId = formRef.id;

      try {
        await signInWithEmailAndPassword(auth, staffEmail, TEST_PASSWORD);
        await expect(
          addDoc(
            collection(db, "clientFormTasks"),
            makeTask(clientId, taxFormId, bkRec.uid),
          ),
        ).rejects.toThrow();
      } finally {
        await signOut(auth);
        await adminFirestore
          .doc(`clients/${clientId}`)
          .delete()
          .catch(() => undefined);
        await adminFirestore
          .doc(`taxForms/${taxFormId}`)
          .delete()
          .catch(() => undefined);
        await adminAuth.deleteUser(staffRec.uid);
        await adminAuth.deleteUser(bkRec.uid);
      }
    }, 60_000);

    it("bookkeeper can update own pending task (edit deadline)", async () => {
      const bkEmail = `bk-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);
      const adminFirestore = getAdminFirestore(adminApp);

      const bkRec = await adminAuth.createUser({
        email: bkEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(bkRec.uid, { role: "bookkeeper" });

      const clientRef = await adminFirestore
        .collection("clients")
        .add(makeClientInput(bkRec.uid));
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
      const clientId = clientRef.id;
      const taxFormId = formRef.id;

      const taskRef = await adminFirestore
        .collection("clientFormTasks")
        .add(adminTask(clientId, taxFormId, bkRec.uid));
      const taskId = taskRef.id;

      try {
        await signInWithEmailAndPassword(auth, bkEmail, TEST_PASSWORD);
        const newDeadline = Timestamp.fromDate(
          new Date("2026-05-10T00:00:00Z"),
        );
        await updateDoc(doc(db, "clientFormTasks", taskId), {
          deadlineDate: newDeadline,
          updatedAt: serverTimestamp(),
        });
        const snap = await getDoc(doc(db, "clientFormTasks", taskId));
        expect(snap.data()?.deadlineDate.toDate().toISOString()).toBe(
          newDeadline.toDate().toISOString(),
        );
      } finally {
        await signOut(auth);
        await adminFirestore
          .doc(`clientFormTasks/${taskId}`)
          .delete()
          .catch(() => undefined);
        await adminFirestore
          .doc(`clients/${clientId}`)
          .delete()
          .catch(() => undefined);
        await adminFirestore
          .doc(`taxForms/${taxFormId}`)
          .delete()
          .catch(() => undefined);
        await adminAuth.deleteUser(bkRec.uid);
      }
    }, 60_000);

    it("bookkeeper B cannot update bookkeeper A's pending task (rules deny)", async () => {
      const bkAEmail = `bk-a-${uniqueSuffix()}@example.com`;
      const bkBEmail = `bk-b-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);
      const adminFirestore = getAdminFirestore(adminApp);

      const bkARec = await adminAuth.createUser({
        email: bkAEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(bkARec.uid, { role: "bookkeeper" });
      const bkBRec = await adminAuth.createUser({
        email: bkBEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(bkBRec.uid, { role: "bookkeeper" });

      const clientRef = await adminFirestore
        .collection("clients")
        .add(makeClientInput(bkARec.uid));
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
      const clientId = clientRef.id;
      const taxFormId = formRef.id;

      const taskRef = await adminFirestore
        .collection("clientFormTasks")
        .add(adminTask(clientId, taxFormId, bkARec.uid));
      const taskId = taskRef.id;

      try {
        await signInWithEmailAndPassword(auth, bkBEmail, TEST_PASSWORD);
        await expect(
          updateDoc(doc(db, "clientFormTasks", taskId), {
            deadlineDate: Timestamp.fromDate(
              new Date("2026-06-01T00:00:00Z"),
            ),
            updatedAt: serverTimestamp(),
          }),
        ).rejects.toThrow();
      } finally {
        await signOut(auth);
        await adminFirestore
          .doc(`clientFormTasks/${taskId}`)
          .delete()
          .catch(() => undefined);
        await adminFirestore
          .doc(`clients/${clientId}`)
          .delete()
          .catch(() => undefined);
        await adminFirestore
          .doc(`taxForms/${taxFormId}`)
          .delete()
          .catch(() => undefined);
        await adminAuth.deleteUser(bkARec.uid);
        await adminAuth.deleteUser(bkBRec.uid);
      }
    }, 60_000);

    it("admin can delete any task", async () => {
      const adminEmail = `admin-del-${uniqueSuffix()}@example.com`;
      const bkEmail = `bk-${uniqueSuffix()}@example.com`;
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
      await adminAuth.setCustomUserClaims(bkRec.uid, { role: "bookkeeper" });

      const clientRef = await adminFirestore
        .collection("clients")
        .add(makeClientInput(bkRec.uid));
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
      const clientId = clientRef.id;
      const taxFormId = formRef.id;

      const taskRef = await adminFirestore
        .collection("clientFormTasks")
        .add(adminTask(clientId, taxFormId, bkRec.uid));
      const taskId = taskRef.id;

      try {
        await signInWithEmailAndPassword(auth, adminEmail, TEST_PASSWORD);
        await deleteDoc(doc(db, "clientFormTasks", taskId));
        // Admin can also verify it's gone via a get.
        const adminFirestoreCheck = await adminFirestore
          .doc(`clientFormTasks/${taskId}`)
          .get();
        expect(adminFirestoreCheck.exists).toBe(false);
      } finally {
        await signOut(auth);
        await adminFirestore
          .doc(`clients/${clientId}`)
          .delete()
          .catch(() => undefined);
        await adminFirestore
          .doc(`taxForms/${taxFormId}`)
          .delete()
          .catch(() => undefined);
        await adminAuth.deleteUser(adminRec.uid);
        await adminAuth.deleteUser(bkRec.uid);
      }
    }, 60_000);

    it("bookkeeper can delete own pending task", async () => {
      const bkEmail = `bk-del-own-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);
      const adminFirestore = getAdminFirestore(adminApp);

      const bkRec = await adminAuth.createUser({
        email: bkEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(bkRec.uid, { role: "bookkeeper" });

      const clientRef = await adminFirestore
        .collection("clients")
        .add(makeClientInput(bkRec.uid));
      const formRef = await adminFirestore.collection("taxForms").add({
        formCode: "1601C",
        formName: "Withholding Tax — Compensation",
        description: "Monthly",
        category: "Withholding",
        defaultFrequency: "monthly",
        defaultDeadlineRule: "fixedDayOfMonthAfterPeriod",
        deadlineShift: 10,
        isActive: true,
        seedSource: true,
      });
      const clientId = clientRef.id;
      const taxFormId = formRef.id;

      const taskRef = await adminFirestore
        .collection("clientFormTasks")
        .add(adminTask(clientId, taxFormId, bkRec.uid));
      const taskId = taskRef.id;

      try {
        await signInWithEmailAndPassword(auth, bkEmail, TEST_PASSWORD);
        await deleteDoc(doc(db, "clientFormTasks", taskId));
        const adminFirestoreCheck = await adminFirestore
          .doc(`clientFormTasks/${taskId}`)
          .get();
        expect(adminFirestoreCheck.exists).toBe(false);
      } finally {
        await signOut(auth);
        await adminFirestore
          .doc(`clients/${clientId}`)
          .delete()
          .catch(() => undefined);
        await adminFirestore
          .doc(`taxForms/${taxFormId}`)
          .delete()
          .catch(() => undefined);
        await adminAuth.deleteUser(bkRec.uid);
      }
    }, 60_000);

    it("bookkeeper cannot delete a 'done' task (rules deny)", async () => {
      const bkEmail = `bk-del-done-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);
      const adminFirestore = getAdminFirestore(adminApp);

      const bkRec = await adminAuth.createUser({
        email: bkEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(bkRec.uid, { role: "bookkeeper" });

      const clientRef = await adminFirestore
        .collection("clients")
        .add(makeClientInput(bkRec.uid));
      const formRef = await adminFirestore.collection("taxForms").add({
        formCode: "1601C",
        formName: "Withholding Tax — Compensation",
        description: "Monthly",
        category: "Withholding",
        defaultFrequency: "monthly",
        defaultDeadlineRule: "fixedDayOfMonthAfterPeriod",
        deadlineShift: 10,
        isActive: true,
        seedSource: true,
      });
      const clientId = clientRef.id;
      const taxFormId = formRef.id;

      const taskRef = await adminFirestore
        .collection("clientFormTasks")
        .add(adminTask(clientId, taxFormId, bkRec.uid, "done"));
      const taskId = taskRef.id;

      try {
        await signInWithEmailAndPassword(auth, bkEmail, TEST_PASSWORD);
        await expect(
          deleteDoc(doc(db, "clientFormTasks", taskId)),
        ).rejects.toThrow();
      } finally {
        await signOut(auth);
        await adminFirestore
          .doc(`clientFormTasks/${taskId}`)
          .delete()
          .catch(() => undefined);
        await adminFirestore
          .doc(`clients/${clientId}`)
          .delete()
          .catch(() => undefined);
        await adminFirestore
          .doc(`taxForms/${taxFormId}`)
          .delete()
          .catch(() => undefined);
        await adminAuth.deleteUser(bkRec.uid);
      }
    }, 60_000);
  },
);
