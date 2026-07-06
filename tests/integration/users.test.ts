/**
 * Integration tests for user-management callables (adminCreateUser +
 * assignRole) and the relaxed firestore rules.
 *
 * Skipped unless `VITE_USE_EMULATOR === "true"` (set by the `test:integration`
 * npm script via firebase-tools emulators:exec). Same pattern as the auth
 * integration test (#3).
 *
 *   1. Seed an admin user (adminAuth + custom claim role=admin + users/{uid}.role)
 *   2. Seed a non-admin user (adminAuth + custom claim role=bookkeeper)
 *   3. Sign in as admin → call adminCreateUser → assert uid + link + Firestore doc
 *   4. Call assignRole → assert new role + claim
 *   5. Try the same as non-admin → expect permission-denied
 *   6. Rules: non-admin cannot read another user's doc
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
  doc,
  getDoc,
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

// Reduce Firestore client SDK log noise.
setLogLevel("error");

import { auth, db, functions } from "@/lib/firebaseConfig";

const uniqueSuffix = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));
const RUN_INTEGRATION = process.env.VITE_USE_EMULATOR === "true";

const PROJECT_ID = "demo-bookkeeper";
const TEST_PASSWORD = "test-password-123";

let adminApp: AdminApp;

(RUN_INTEGRATION ? describe : describe.skip)(
  "user management — emulator integration",
  () => {
    beforeAll(() => {
      expect(auth).toBeDefined();
      expect(db).toBeDefined();
      expect(functions).toBeDefined();

      process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
      process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
      process.env.GCLOUD_PROJECT = PROJECT_ID;
      adminApp = initAdminApp(
        { projectId: PROJECT_ID, credential: applicationDefault() },
        "users-test-admin",
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
      // Ensure no client is signed in from a previous test.
      try {
        await signOut(auth);
      } catch {
        /* no-op */
      }
    });

    it("adminCreateUser creates an Auth account, sets the claim, and writes users/{uid}", async () => {
      const adminEmail = `admin-${uniqueSuffix()}@example.com`;
      const targetEmail = `newbie-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);
      const adminDb = getAdminFirestore(adminApp);

      const adminRecord = await adminAuth.createUser({
        email: adminEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(adminRecord.uid, { role: "admin" });
      await adminDb.doc(`users/${adminRecord.uid}`).set({
        email: adminEmail,
        role: "admin",
        status: "active",
      });

      try {
        await signInWithEmailAndPassword(auth, adminEmail, TEST_PASSWORD);

        const { httpsCallable } = await import("firebase/functions");
        const { userCreateSchema } = await import("@/lib/userSchema");

        const fn = httpsCallable(functions, "adminCreateUser");
        const { data } = await fn(userCreateSchema.parse({
          email: targetEmail,
          displayName: "New Bie",
          role: "bookkeeper",
        }));
        const result = data as { uid: string; passwordResetLink: string };
        expect(typeof result.uid).toBe("string");
        expect(result.uid.length).toBeGreaterThan(0);
        expect(typeof result.passwordResetLink).toBe("string");
        expect(result.passwordResetLink).toMatch(/^https?:\/\//);

        const userDoc = await getDoc(doc(db, "users", result.uid));
        expect(userDoc.exists()).toBe(true);
        const u = userDoc.data();
        expect(u?.email).toBe(targetEmail);
        expect(u?.name).toBe("New Bie");
        expect(u?.role).toBe("bookkeeper");
        expect(u?.status).toBe("active");

        // Cleanup the newly created user via admin SDK so subsequent
        // runs are clean.
        await adminAuth.deleteUser(result.uid);
      } finally {
        await signOut(auth);
        await adminAuth.deleteUser(adminRecord.uid);
      }
    }, 60_000);

    it("assignRole updates the custom claim and the users/{uid}.role", async () => {
      const adminEmail = `admin-${uniqueSuffix()}@example.com`;
      const targetEmail = `target-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);
      const adminDb = getAdminFirestore(adminApp);

      const adminRecord = await adminAuth.createUser({
        email: adminEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(adminRecord.uid, { role: "admin" });
      await adminDb.doc(`users/${adminRecord.uid}`).set({
        email: adminEmail,
        role: "admin",
        status: "active",
      });

      const targetRecord = await adminAuth.createUser({
        email: targetEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(targetRecord.uid, { role: "staff" });
      await adminDb.doc(`users/${targetRecord.uid}`).set({
        email: targetEmail,
        role: "staff",
        status: "active",
      });

      try {
        await signInWithEmailAndPassword(auth, adminEmail, TEST_PASSWORD);
        const { httpsCallable } = await import("firebase/functions");

        const fn = httpsCallable(functions, "assignRole");
        const { data } = await fn({
          uid: targetRecord.uid,
          role: "bookkeeper",
        });
        const result = data as { uid: string; role: string };
        expect(result.uid).toBe(targetRecord.uid);
        expect(result.role).toBe("bookkeeper");

        const updated = await getDoc(doc(db, "users", targetRecord.uid));
        expect(updated.data()?.role).toBe("bookkeeper");
      } finally {
        await signOut(auth);
        await adminAuth.deleteUser(targetRecord.uid);
        await adminAuth.deleteUser(adminRecord.uid);
      }
    }, 60_000);

    it("non-admin calling adminCreateUser is denied with permission-denied", async () => {
      const adminEmail = `admin-${uniqueSuffix()}@example.com`;
      const bkEmail = `bk-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);
      const adminDb = getAdminFirestore(adminApp);

      const adminRecord = await adminAuth.createUser({
        email: adminEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(adminRecord.uid, { role: "admin" });
      await adminDb.doc(`users/${adminRecord.uid}`).set({
        email: adminEmail,
        role: "admin",
        status: "active",
      });

      const bkRecord = await adminAuth.createUser({
        email: bkEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(bkRecord.uid, { role: "bookkeeper" });

      try {
        await signInWithEmailAndPassword(auth, bkEmail, TEST_PASSWORD);
        const { httpsCallable } = await import("firebase/functions");

        const fn = httpsCallable(functions, "adminCreateUser");
        await expect(
          fn({
            email: `victim-${uniqueSuffix()}@example.com`,
            displayName: "Victim",
            role: "staff",
          }),
        ).rejects.toMatchObject({ code: "functions/permission-denied" });
      } finally {
        await signOut(auth);
        await adminAuth.deleteUser(bkRecord.uid);
        await adminAuth.deleteUser(adminRecord.uid);
      }
    }, 60_000);

    it("rules: non-admin cannot read another user's users/{uid} doc", async () => {
      const aEmail = `a-${uniqueSuffix()}@example.com`;
      const bEmail = `b-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);
      const adminDb = getAdminFirestore(adminApp);

      const aRec = await adminAuth.createUser({
        email: aEmail,
        password: TEST_PASSWORD,
      });
      await adminDb.doc(`users/${aRec.uid}`).set({
        email: aEmail,
        role: "bookkeeper",
        status: "active",
      });
      await adminAuth.setCustomUserClaims(aRec.uid, { role: "bookkeeper" });

      const bRec = await adminAuth.createUser({
        email: bEmail,
        password: TEST_PASSWORD,
      });
      await adminDb.doc(`users/${bRec.uid}`).set({
        email: bEmail,
        role: "staff",
        status: "active",
      });
      await adminAuth.setCustomUserClaims(bRec.uid, { role: "staff" });

      try {
        await signInWithEmailAndPassword(auth, aEmail, TEST_PASSWORD);
        // a (bookkeeper) tries to read b's doc — should be denied.
        await expect(getDoc(doc(db, "users", bRec.uid))).rejects.toThrow();
        // a can read their own doc.
        const own = await getDoc(doc(db, "users", aRec.uid));
        expect(own.exists()).toBe(true);
      } finally {
        await signOut(auth);
        await adminAuth.deleteUser(aRec.uid);
        await adminAuth.deleteUser(bRec.uid);
      }
    }, 60_000);
  },
);