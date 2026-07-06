/**
 * Integration tests for the BIR holiday seeding Cloud Function
 * (`seedBirHolidays`) and the underlying data shape.
 *
 * Skipped unless `VITE_USE_EMULATOR === "true"` (set by the
 * `test:integration` npm script via firebase-tools emulators:exec).
 *
 * Strategy mirrors tests/integration/users.test.ts:
 *   1. Seed an admin user (adminAuth + custom claim role=admin).
 *   2. Sign in as admin via the singleton client auth.
 *   3. Call seedBirHolidays via httpsCallable.
 *   4. Read config/birHolidays/{2026,2027} via the Firestore client SDK.
 *   5. Assert both docs exist with non-empty `days` arrays.
 *   6. Call seedBirHolidays again — assert no errors and the docs are
 *      unchanged (idempotency).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { setLogLevel } from "firebase/firestore";
import {
  initializeApp as initAdminApp,
  applicationDefault,
  deleteApp as deleteAdminApp,
  type App as AdminApp,
} from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";

setLogLevel("error");

import { auth, functions } from "@/lib/firebaseConfig";

const uniqueSuffix = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
const RUN_INTEGRATION = process.env.VITE_USE_EMULATOR === "true";

const PROJECT_ID = "demo-bookkeeper";
const TEST_PASSWORD = "test-password-123";

let adminApp: AdminApp;

(RUN_INTEGRATION ? describe : describe.skip)(
  "BIR holidays seeding — emulator integration",
  () => {
    beforeAll(() => {
      expect(auth).toBeDefined();
      expect(functions).toBeDefined();

      process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
      process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
      process.env.GCLOUD_PROJECT = PROJECT_ID;
      adminApp = initAdminApp(
        { projectId: PROJECT_ID, credential: applicationDefault() },
        "holidays-test-admin",
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

    it(
      "seeds birHolidays/{2026,2027} with non-empty days arrays and is idempotent",
      async () => {
        const adminEmail = `admin-${uniqueSuffix()}@example.com`;
        const adminAuth = getAdminAuth(adminApp);
        const adminDb = getAdminFirestore(adminApp);

        const adminRecord = await adminAuth.createUser({
          email: adminEmail,
          password: TEST_PASSWORD,
        });
        await adminAuth.setCustomUserClaims(adminRecord.uid, {
          role: "admin",
        });
        await adminDb.doc(`users/${adminRecord.uid}`).set({
          email: adminEmail,
          role: "admin",
          status: "active",
        });

        try {
          await signInWithEmailAndPassword(auth, adminEmail, TEST_PASSWORD);

          const { httpsCallable } = await import("firebase/functions");

          // First call — should write both year docs.
          const fn = httpsCallable(functions, "seedBirHolidays");
          const first = await fn();
          const firstResult = first.data as { count: number; years: string[] };
          expect(firstResult.years).toEqual(["2026", "2027"]);
          expect(firstResult.count).toBeGreaterThan(0);

          // Read back both docs. We use the admin Firestore SDK because
          // the `birHolidays` collection is not yet covered by client
          // security rules (intentional — see slice #4 issue brief). The
          // client SDK will need a read rule added in a later slice.
          const adminDb2 = getAdminFirestore(adminApp);
          const snap2026 = await adminDb2.doc(`birHolidays/2026`).get();
          const snap2027 = await adminDb2.doc(`birHolidays/2027`).get();
          expect(snap2026.exists).toBe(true);
          expect(snap2027.exists).toBe(true);

          const data2026 = snap2026.data() as { days: string[] };
          const data2027 = snap2027.data() as { days: string[] };
          expect(Array.isArray(data2026.days)).toBe(true);
          expect(Array.isArray(data2027.days)).toBe(true);
          expect(data2026.days.length).toBeGreaterThan(0);
          expect(data2027.days.length).toBeGreaterThan(0);

          // May 1 must be present in 2026 (acceptance criterion support).
          expect(data2026.days).toContain("2026-05-01");

          // Snapshot before second call.
          const daysBefore2026 = [...data2026.days];
          const daysBefore2027 = [...data2027.days];

          // Second call — must succeed (idempotent) and not error out.
          const second = await fn();
          const secondResult = second.data as { count: number; years: string[] };
          expect(secondResult.years).toEqual(["2026", "2027"]);

          // Doc content must be unchanged (the merge:true + deterministic
          // data means a re-run replaces exactly the same fields with
          // the same values).
          const snap2026Again = await adminDb2.doc(`birHolidays/2026`).get();
          const snap2027Again = await adminDb2.doc(`birHolidays/2027`).get();
          expect(snap2026Again.data()?.days).toEqual(daysBefore2026);
          expect(snap2027Again.data()?.days).toEqual(daysBefore2027);
        } finally {
          await signOut(auth);
          await adminAuth.deleteUser(adminRecord.uid);
        }
      },
      60_000,
    );

    it("non-admin calling seedBirHolidays is denied with permission-denied", async () => {
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
      await adminAuth.setCustomUserClaims(bkRecord.uid, {
        role: "bookkeeper",
      });

      try {
        await signInWithEmailAndPassword(auth, bkEmail, TEST_PASSWORD);
        const { httpsCallable } = await import("firebase/functions");
        const fn = httpsCallable(functions, "seedBirHolidays");
        await expect(fn()).rejects.toMatchObject({
          code: "functions/permission-denied",
        });
      } finally {
        await signOut(auth);
        await adminAuth.deleteUser(bkRecord.uid);
        await adminAuth.deleteUser(adminRecord.uid);
      }
    }, 60_000);
  },
);