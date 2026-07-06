/**
 * Integration tests for client CRUD (slice #7).
 *
 * Skipped unless `VITE_USE_EMULATOR === "true"` (set by the
 * `test:integration` npm script via firebase-tools emulators:exec).
 *
 * Strategy:
 *   1. Seed an admin + a bookkeeper Auth user via Admin SDK.
 *   2. Seed a staff Auth user with no admin/bookkeeper claim.
 *   3. Each `it` signs in via the client SDK, then writes / reads
 *      through Firestore under the relaxed slice #7 rules and asserts
 *      whether the operation succeeded or threw a permission error.
 *
 * Covers:
 *   - admin can create a client with all 11 fields
 *   - bookkeeper can create a client
 *   - staff cannot create a client
 *   - bookkeeper cannot delete a client (admin-only)
 *   - admin can archive (status='archived') and re-read;
 *     bookkeeper cannot read an archived client
 *   - admin can read an archived client
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
  setDoc,
  setLogLevel,
} from "firebase/firestore";
import {
  initializeApp as initAdminApp,
  applicationDefault,
  deleteApp as deleteAdminApp,
  type App as AdminApp,
} from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";

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

interface ValidClient {
  businessName: string;
  ownerName: string;
  tin: string;
  rdo: string;
  address: string;
  contactNumber: string;
  email: string;
  assignedBookkeeperId: string;
  status: "active" | "inactive" | "archived";
  notes: string;
}

function makeClient(uid: string): ValidClient {
  return {
    businessName: `Acme-${uniqueSuffix()}`,
    ownerName: "Jane Doe",
    tin: "123-456-789",
    rdo: "047",
    address: "123 Main St, Quezon City",
    contactNumber: "+63 917 123 4567",
    email: `contact-${uniqueSuffix()}@acme.example`,
    assignedBookkeeperId: uid,
    status: "active",
    notes: "VIP client",
  };
}

(RUN_INTEGRATION ? describe : describe.skip)(
  "clients — emulator integration",
  () => {
    beforeAll(() => {
      expect(auth).toBeDefined();
      expect(db).toBeDefined();

      process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
      process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
      process.env.GCLOUD_PROJECT = PROJECT_ID;
      adminApp = initAdminApp(
        { projectId: PROJECT_ID, credential: applicationDefault() },
        "clients-test-admin",
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

    it("admin can create a client with all 11 fields and re-read it", async () => {
      const adminEmail = `admin-${uniqueSuffix()}@example.com`;
      const bkEmail = `bk-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);

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

      try {
        await signInWithEmailAndPassword(auth, adminEmail, TEST_PASSWORD);

        const data = makeClient(bkRec.uid);
        // The NewClientDialog appends serverTimestamps exactly like
        // this — mirror that so the persisted shape matches production.
        const ref = await addDoc(collection(db, "clients"), {
          ...data,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        const snap = await getDoc(ref);

        expect(snap.exists()).toBe(true);
        const got = snap.data();
        expect(got.businessName).toBe(data.businessName);
        expect(got.tin).toBe(data.tin);
        expect(got.assignedBookkeeperId).toBe(data.assignedBookkeeperId);
        expect(got.status).toBe("active");
        expect(got.notes).toBe("VIP client");
        // PRD calls for 10 user-supplied fields + createdAt + updatedAt
        // (both serverTimestamp-populated). With merge: false from addDoc
        // (no pre-existing fields), the doc carries exactly 12 fields.
        const fieldCount = Object.keys(got).length;
        expect(fieldCount).toBe(12);
        expect(got.createdAt).toBeDefined();
        expect(got.updatedAt).toBeDefined();
      } finally {
        await signOut(auth);
        await adminAuth.deleteUser(adminRec.uid);
        await adminAuth.deleteUser(bkRec.uid);
      }
    }, 60_000);

    it("bookkeeper can create a client", async () => {
      const bkEmail = `bk-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);

      const bkRec = await adminAuth.createUser({
        email: bkEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(bkRec.uid, { role: "bookkeeper" });

      try {
        await signInWithEmailAndPassword(auth, bkEmail, TEST_PASSWORD);

        const data = makeClient(bkRec.uid);
        const ref = await addDoc(collection(db, "clients"), data);
        const snap = await getDoc(ref);
        expect(snap.exists()).toBe(true);
      } finally {
        await signOut(auth);
        await adminAuth.deleteUser(bkRec.uid);
      }
    }, 60_000);

    it("staff cannot create a client (rules deny)", async () => {
      const staffEmail = `staff-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);

      const staffRec = await adminAuth.createUser({
        email: staffEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(staffRec.uid, { role: "staff" });

      try {
        await signInWithEmailAndPassword(auth, staffEmail, TEST_PASSWORD);

        const data = makeClient(staffRec.uid);
        await expect(addDoc(collection(db, "clients"), data)).rejects.toThrow();
      } finally {
        await signOut(auth);
        await adminAuth.deleteUser(staffRec.uid);
      }
    }, 60_000);

    it("bookkeeper cannot delete a client (rules deny)", async () => {
      const bkEmail = `bk-del-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);
      const adminFirestore = getAdminFirestore(adminApp);

      const bkRec = await adminAuth.createUser({
        email: bkEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(bkRec.uid, { role: "bookkeeper" });

      // Pre-seed via Admin SDK so the bookkeeper can attempt delete.
      const data = makeClient(bkRec.uid);
      const seededRef = await adminFirestore.collection("clients").add(data);
      const clientId = seededRef.id;

      try {
        await signInWithEmailAndPassword(auth, bkEmail, TEST_PASSWORD);
        await expect(deleteDoc(doc(db, "clients", clientId))).rejects.toThrow();
      } finally {
        await signOut(auth);
        try {
          await adminFirestore.doc(`clients/${clientId}`).delete();
        } catch {
          /* fine */
        }
        await adminAuth.deleteUser(bkRec.uid);
      }
    }, 60_000);

    it("admin can archive a client; bookkeeper cannot read archived; admin can", async () => {
      const adminEmail = `admin-arch-${uniqueSuffix()}@example.com`;
      const bkEmail = `bk-arch-${uniqueSuffix()}@example.com`;
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

      // Admin pre-seeds the client so we can archive it via rules.
      const data = makeClient(bkRec.uid);
      const seededRef = await adminFirestore.collection("clients").add(data);
      const clientId = seededRef.id;

      try {
        // 1. Sign in as admin → archive the doc.
        await signInWithEmailAndPassword(auth, adminEmail, TEST_PASSWORD);
        await setDoc(
          doc(db, "clients", clientId),
          { status: "archived" },
          { merge: true },
        );
        const adminArchiveSnap = await getDoc(doc(db, "clients", clientId));
        expect(adminArchiveSnap.exists()).toBe(true);
        expect(adminArchiveSnap.data()?.status).toBe("archived");
        await signOut(auth);

        // 2. Sign in as bookkeeper → read must be denied.
        await signInWithEmailAndPassword(auth, bkEmail, TEST_PASSWORD);
        await expect(getDoc(doc(db, "clients", clientId))).rejects.toThrow();
        await signOut(auth);

        // 3. Sign in as admin → read succeeds.
        await signInWithEmailAndPassword(auth, adminEmail, TEST_PASSWORD);
        const adminReadSnap = await getDoc(doc(db, "clients", clientId));
        expect(adminReadSnap.exists()).toBe(true);
      } finally {
        await signOut(auth);
        try {
          await adminFirestore.doc(`clients/${clientId}`).delete();
        } catch {
          /* fine */
        }
        await adminAuth.deleteUser(adminRec.uid);
        await adminAuth.deleteUser(bkRec.uid);
      }
    }, 60_000);
  },
);
