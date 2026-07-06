/**
 * Integration test for the auth shell against the Firebase emulator suite.
 *
 * Skipped unless `VITE_USE_EMULATOR === "true"` (set by the `test:integration`
 * npm script via firebase-tools emulators:exec).
 *
 * Strategy: reuse the singleton Firebase app imported by @/lib/firebaseConfig,
 * which auto-connects to the local emulators when VITE_USE_EMULATOR=true.
 * Use firebase-admin SDK for seeding — admin SDK bypasses Firestore rules
 * in emulator mode (and lets us set custom claims directly).
 *
 *   1. Seed a user with admin.auth().createUser() and set custom claim "admin".
 *   2. Seed users/{uid}.role = "admin" in Firestore.
 *   3. signInWithEmailAndPassword as that user via the singleton auth.
 *   4. Call resolveRole(user) — asserts it reads from Firestore and returns "admin".
 *   5. Repeat for "bookkeeper" claim-only and a defaulting "staff" user.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import {
  initializeApp as initAdminApp,
  applicationDefault,
  deleteApp as deleteAdminApp,
  type App as AdminApp,
} from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";

import { auth, db } from "@/lib/firebaseConfig";

const RUN_INTEGRATION = process.env.VITE_USE_EMULATOR === "true";

const EMULATOR_AUTH_URL = "http://127.0.0.1:9099";
const EMULATOR_FIRESTORE_HOST = "127.0.0.1";
const EMULATOR_FIRESTORE_PORT = 8080;
const TEST_PASSWORD = "test-password-123";

const PROJECT_ID = "demo-bookkeeper";

let adminApp: AdminApp;

(RUN_INTEGRATION ? describe : describe.skip)(
  "auth shell — emulator integration",
  () => {
    beforeAll(() => {
      // Make sure the singleton client is connected. We rely on
      // @/lib/firebaseConfig having already wired `auth` and `db` to the
      // emulator because VITE_USE_EMULATOR=true is set in the env by the
      // npm script that invokes this file.
      expect(auth).toBeDefined();
      expect(db).toBeDefined();

      // Boot a separate admin SDK app pointed at the emulators. The Admin
      // SDK uses FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST env
      // vars, which firebase-tools emulators:exec exports for us.
      process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
      process.env.FIRESTORE_EMULATOR_HOST = `${EMULATOR_FIRESTORE_HOST}:${EMULATOR_FIRESTORE_PORT}`;
      process.env.GCLOUD_PROJECT = PROJECT_ID;
      adminApp = initAdminApp(
        { projectId: PROJECT_ID, credential: applicationDefault() },
        "auth-test-admin",
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

    it("resolves role=admin from users/{uid}.role in Firestore", async () => {
      const email = `admin-${Date.now()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);
      const adminDb = getAdminFirestore(adminApp);

      const userRecord = await adminAuth.createUser({ email, password: TEST_PASSWORD });
      await adminDb.doc(`users/${userRecord.uid}`).set({
        email,
        role: "admin",
      });

      const cred = await signInWithEmailAndPassword(auth, email, TEST_PASSWORD);
      try {
        const { resolveRole } = await import("@/features/auth/resolveRole");
        const role = await resolveRole(cred.user);
        expect(role).toBe("admin");

        // Also assert the Firestore doc actually exists where we wrote it.
        const snap = await getDoc(doc(db, "users", userRecord.uid));
        expect(snap.exists()).toBe(true);
      } finally {
        await signOut(auth);
        await adminAuth.deleteUser(userRecord.uid);
      }
    }, 30_000);

    it("falls back to custom claim role=bookkeeper when Firestore doc is absent", async () => {
      const email = `bk-${Date.now()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);

      const userRecord = await adminAuth.createUser({ email, password: TEST_PASSWORD });
      await adminAuth.setCustomUserClaims(userRecord.uid, { role: "bookkeeper" });

      const cred = await signInWithEmailAndPassword(auth, email, TEST_PASSWORD);
      try {
        const { resolveRole } = await import("@/features/auth/resolveRole");
        // Force-refresh the token so the new claim is on the credential.
        await cred.user.getIdToken(/* forceRefresh */ true);
        const role = await resolveRole(cred.user);
        expect(role).toBe("bookkeeper");
      } finally {
        await signOut(auth);
        await adminAuth.deleteUser(userRecord.uid);
      }
    }, 30_000);

    it("defaults to 'staff' when neither Firestore doc nor claim is set", async () => {
      const email = `staff-${Date.now()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);

      const userRecord = await adminAuth.createUser({ email, password: TEST_PASSWORD });
      // No Firestore write, no custom claim.

      const cred = await signInWithEmailAndPassword(auth, email, TEST_PASSWORD);
      try {
        const { resolveRole } = await import("@/features/auth/resolveRole");
        const role = await resolveRole(cred.user);
        expect(role).toBe("staff");
      } finally {
        await signOut(auth);
        await adminAuth.deleteUser(userRecord.uid);
      }
    }, 30_000);

    // Silence unused-import warning when this describe is skipped at runtime.
    void EMULATOR_AUTH_URL;
  },
);