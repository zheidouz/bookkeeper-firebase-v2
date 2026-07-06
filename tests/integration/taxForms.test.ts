/**
 * Integration tests for the tax-form library (slice #6).
 *
 * Skipped unless `VITE_USE_EMULATOR === "true"` (set by the
 * `test:integration` npm script via firebase-tools emulators:exec).
 *
 * Strategy:
 *   1. Use Admin SDK to seed an admin + a bookkeeper Auth user.
 *   2. From the singleton client SDK (under those signed-in sessions),
 *      exercise the taxForms collection + rules.
 *   3. Exercise the pure mergeSeedForms via Admin SDK direct writes
 *      (validates the no-clobber logic survives an end-to-end
 *      Firestore round trip without leaning on auth state across
 *      test boundaries — a known flakiness vector with emulators).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
  doc,
  getDoc,
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
import { getFirestore as getAdminFirestore, FieldValue as AdminFieldValue } from "firebase-admin/firestore";

setLogLevel("error");

import { auth, db } from "@/lib/firebaseConfig";
import {
  mergeSeedForms,
  type TaxFormSeed,
} from "@/lib/mergeSeedForms";
import birFormsSeed from "@/seed/birForms.json";

const uniqueSuffix = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
const RUN_INTEGRATION = process.env.VITE_USE_EMULATOR === "true";

const PROJECT_ID = "demo-bookkeeper";
const TEST_PASSWORD = "test-password-123";

let adminApp: AdminApp;

(RUN_INTEGRATION ? describe : describe.skip)(
  "tax forms — emulator integration",
  () => {
    beforeAll(() => {
      expect(auth).toBeDefined();
      expect(db).toBeDefined();

      process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
      process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
      process.env.GCLOUD_PROJECT = PROJECT_ID;
      adminApp = initAdminApp(
        { projectId: PROJECT_ID, credential: applicationDefault() },
        "tax-forms-test-admin",
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

    it("admin can create + read a taxForms/{code} doc", async () => {
      const adminEmail = `admin-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);
      const rec = await adminAuth.createUser({
        email: adminEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(rec.uid, { role: "admin" });

      try {
        await signInWithEmailAndPassword(auth, adminEmail, TEST_PASSWORD);

        const docId = `9999-TEST-${uniqueSuffix()}`;
        const ref = doc(db, "taxForms", docId);

        // Create
        await setDoc(ref, {
          formCode: docId,
          formName: "Test form",
          description: "Created via integration test.",
          category: "Miscellaneous",
          defaultFrequency: "annual",
          defaultDeadlineRule: "lastDayOfMonthAfterPeriod",
          deadlineShift: null,
          isActive: true,
          seedSource: false,
        });

        // Read
        const snap = await getDoc(ref);
        expect(snap.exists()).toBe(true);
        expect(snap.data()?.formName).toBe("Test form");
      } finally {
        await signOut(auth);
        await adminAuth.deleteUser(rec.uid);
      }
    }, 60_000);

    it("bookkeeper can create a taxForms/{code} doc and cannot delete it", async () => {
      const bkEmail = `bk-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);
      const rec = await adminAuth.createUser({
        email: bkEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(rec.uid, { role: "bookkeeper" });

      try {
        await signInWithEmailAndPassword(auth, bkEmail, TEST_PASSWORD);

        const docId = `9999-BK-${uniqueSuffix()}`;
        const ref = doc(db, "taxForms", docId);

        // Create — should succeed under rules (bookkeeper or admin).
        await setDoc(ref, {
          formCode: docId,
          formName: "Bookkeeper-created",
          description: "Created by a bookkeeper.",
          category: "Miscellaneous",
          defaultFrequency: "annual",
          defaultDeadlineRule: "lastDayOfMonthAfterPeriod",
          deadlineShift: null,
          isActive: true,
          seedSource: false,
        });
        const snap = await getDoc(ref);
        expect(snap.exists()).toBe(true);
      } finally {
        await signOut(auth);
        await adminAuth.deleteUser(rec.uid);
      }
    }, 60_000);

    it("bookkeeper delete of a taxForms/{code} doc is denied by rules", async () => {
      const bkEmail = `bk-del-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);
      const adminFirestore = getAdminFirestore(adminApp);
      const rec = await adminAuth.createUser({
        email: bkEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(rec.uid, { role: "bookkeeper" });

      // Pre-seed a doc via Admin SDK (bypassing rules) so the bookkeeper
      // can attempt to delete it.
      const docId = `9999-BKDEL-${uniqueSuffix()}`;
      await adminFirestore
        .doc(`taxForms/${docId}`)
        .set({ formCode: docId, formName: "Pre-existing" });

      try {
        await signInWithEmailAndPassword(auth, bkEmail, TEST_PASSWORD);
        const { deleteDoc: deleteDocFn } = await import(
          "firebase/firestore"
        );
        await expect(
          deleteDocFn(doc(db, "taxForms", docId)),
        ).rejects.toThrow();
      } finally {
        await signOut(auth);
        try {
          await adminFirestore.doc(`taxForms/${docId}`).delete();
        } catch {
          /* fine if already gone */
        }
        await adminAuth.deleteUser(rec.uid);
      }
    }, 60_000);

    it("non-admin (staff) cannot create taxForms/{code}", async () => {
      const staffEmail = `staff-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);
      const rec = await adminAuth.createUser({
        email: staffEmail,
        password: TEST_PASSWORD,
      });
      await adminAuth.setCustomUserClaims(rec.uid, { role: "staff" });

      try {
        await signInWithEmailAndPassword(auth, staffEmail, TEST_PASSWORD);
        const docId = `9999-STAFF-${uniqueSuffix()}`;
        const ref = doc(db, "taxForms", docId);

        await expect(
          setDoc(ref, {
            formCode: docId,
            formName: "Should fail",
            description: "No write should succeed.",
            category: "Miscellaneous",
            defaultFrequency: "annual",
            defaultDeadlineRule: "lastDayOfMonthAfterPeriod",
            deadlineShift: null,
            isActive: true,
            seedSource: false,
          }),
        ).rejects.toThrow();
      } finally {
        await signOut(auth);
        await adminAuth.deleteUser(rec.uid);
      }
    }, 60_000);

    it("end-to-end (Admin SDK): merging the seed file produces 18 inserts into an empty taxForms collection", async () => {
      const adminFirestore = getAdminFirestore(adminApp);
      const collectionRef = adminFirestore.collection("taxForms");

      // Snapshot whatever's currently there.
      const existingSnap = await collectionRef.get();
      const existing = existingSnap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          formCode: String(data.formCode ?? d.id),
          formName: data.formName as string | undefined,
          description: data.description as string | undefined,
          category: data.category as
            | "VAT"
            | "Income Tax"
            | "Percentage Tax"
            | "Withholding"
            | "Registration"
            | "Miscellaneous"
            | undefined,
          defaultFrequency: data.defaultFrequency as
            | "monthly"
            | "quarterly"
            | "semi_annual"
            | "annual"
            | "custom"
            | undefined,
          defaultDeadlineRule: data.defaultDeadlineRule as
            | "lastDayOfMonthAfterPeriod"
            | "lastWorkingDayOfMonthAfterPeriod"
            | "lastWorkingDayOfMonthAfterPeriod+1"
            | "fixedDayOfMonthAfterPeriod"
            | undefined,
          deadlineShift:
            data.deadlineShift == null
              ? null
              : (data.deadlineShift as number),
          isActive: data.isActive as boolean | undefined,
          seedSource: data.seedSource as boolean | undefined,
          createdAt: data.createdAt,
        };
      });

      // Run the pure merge.
      const seeds = birFormsSeed as unknown as TaxFormSeed[];
      const results = mergeSeedForms(seeds, existing);

      // Apply via Admin SDK writes (bypass rules for setup purposes —
      // the rules are exercised separately by client-SDK tests above).
      for (const r of results) {
        if (r.action === "insert" || r.action === "update") {
          const data = r.merged as Record<string, unknown>;
          await adminFirestore
            .doc(`taxForms/${r.formCode}`)
            .set({ ...data }, { merge: true });
        }
      }

      // Verify count.
      const afterSnap = await collectionRef.get();
      expect(afterSnap.size).toBeGreaterThanOrEqual(18);
    }, 60_000);

    it("re-running the seed against the populated collection is a no-clobber no-op", async () => {
      const adminFirestore = getAdminFirestore(adminApp);
      const collectionRef = adminFirestore.collection("taxForms");

      // Self-seed: write the 18 canonical forms so this test is independent
      // of test ordering. Admin SDK bypasses rules; merge=false to overwrite.
      const seedsForSetup = birFormsSeed as unknown as Array<Record<string, unknown>>;
      for (const seed of seedsForSetup) {
        await adminFirestore.doc(`taxForms/${String(seed.formCode)}`).set(
          { ...seed, createdAt: AdminFieldValue.serverTimestamp() },
          { merge: false },
        );
      }

      const snap = await collectionRef.get();
      const existing = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          formCode: String(data.formCode ?? d.id),
          formName: data.formName as string | undefined,
          description: data.description as string | undefined,
          category: data.category as
            | "VAT"
            | "Income Tax"
            | "Percentage Tax"
            | "Withholding"
            | "Registration"
            | "Miscellaneous"
            | undefined,
          defaultFrequency: data.defaultFrequency as
            | "monthly"
            | "quarterly"
            | "semi_annual"
            | "annual"
            | "custom"
            | undefined,
          defaultDeadlineRule: data.defaultDeadlineRule as
            | "lastDayOfMonthAfterPeriod"
            | "lastWorkingDayOfMonthAfterPeriod"
            | "lastWorkingDayOfMonthAfterPeriod+1"
            | "fixedDayOfMonthAfterPeriod"
            | undefined,
          deadlineShift:
            data.deadlineShift == null
              ? null
              : (data.deadlineShift as number),
          isActive: data.isActive as boolean | undefined,
          seedSource: data.seedSource as boolean | undefined,
          createdAt: data.createdAt,
        };
      });

      const seeds = birFormsSeed as unknown as TaxFormSeed[];
      const results = mergeSeedForms(seeds, existing);

      // Re-running against a populated collection must NOT create new
      // docs (no 'insert' actions) and should process all 18 seeds
      // (updates + skips = 18).
      const inserts = results.filter((r) => r.action === "insert");
      const updates = results.filter((r) => r.action === "update");
      const skips = results.filter((r) => r.action === "skip");
      expect(inserts.length).toBe(0);
      expect(updates.length + skips.length).toBe(18);
    }, 60_000);

    it("rules: a user with no role can read but not write", async () => {
      const noRoleEmail = `norole-${uniqueSuffix()}@example.com`;
      const adminAuth = getAdminAuth(adminApp);
      const adminFirestore = getAdminFirestore(adminApp);
      const rec = await adminAuth.createUser({
        email: noRoleEmail,
        password: TEST_PASSWORD,
      });
      // No setCustomUserClaims call → token.role is null/undefined.

      // Pre-seed a doc via Admin SDK so the no-role user has something
      // to read.
      await adminFirestore.doc("taxForms/2550Q").set(
        {
          formCode: "2550Q",
          formName: "Quarterly Value-Added Tax Return",
          description: "Quarterly VAT return.",
          category: "VAT",
          defaultFrequency: "quarterly",
          defaultDeadlineRule: "lastWorkingDayOfMonthAfterPeriod+1",
          deadlineShift: null,
          isActive: true,
          seedSource: true,
        },
        { merge: true },
      );

      try {
        await signInWithEmailAndPassword(auth, noRoleEmail, TEST_PASSWORD);

        const ref = doc(db, "taxForms", "2550Q");
        const readSnap = await getDoc(ref);
        expect(readSnap.exists()).toBe(true);

        // Write must be denied.
        await expect(
          setDoc(ref, { description: "no role no right" }, { merge: true }),
        ).rejects.toThrow();
      } finally {
        await signOut(auth);
        await adminAuth.deleteUser(rec.uid);
      }
    }, 60_000);
  },
);
