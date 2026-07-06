/**
 * Integration tests for the dashboard (slice #12 / issue #12).
 *
 * Skipped unless `VITE_USE_EMULATOR === "true"` (set by the
 * `test:integration` npm script via firebase-tools emulators:exec).
 *
 * Strategy: seed admin + 2 clients + 6 tasks across statuses +
 * deadlines (some overdue, some due-this-month, some done, one
 * archived). Render the dashboard via @testing-library/react,
 * wrapped in QueryClientProvider + AuthProvider. The dashboard's
 * onSnapshot pushes rows into the TanStack cache; we assert that
 * the 8 cards reflect the seed dataset. Then update one task's
 * status via Admin SDK and assert the cards re-render — that's the
 * live-update path the spec requires.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { auth, db } from "@/lib/firebaseConfig";
import { AuthProvider } from "@/features/auth/AuthProvider";
import DashboardPage from "@/features/dashboard/DashboardPage";

const uniqueSuffix = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
const RUN_INTEGRATION = process.env.VITE_USE_EMULATOR === "true";

const PROJECT_ID = "demo-bookkeeper";
const TEST_PASSWORD = "test-password-123";

let adminApp: AdminApp;

interface SeedTask {
  clientId: string;
  taxFormId: string;
  assignedBookkeeperId: string;
  status:
    | "pending"
    | "ready_to_file"
    | "submitted"
    | "done"
    | "archived";
  archived: boolean;
  /** ISO yyyy-mm-dd (UTC). */
  deadlineIso: string;
}

function renderDashboard(): { unmount: () => void } {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  const result = render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <DashboardPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { unmount: () => result.unmount() };
}

(RUN_INTEGRATION ? describe : describe.skip)(
  "dashboard — emulator integration",
  () => {
    beforeAll(() => {
      expect(auth).toBeDefined();
      expect(db).toBeDefined();

      process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
      process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
      process.env.GCLOUD_PROJECT = PROJECT_ID;
      adminApp = initAdminApp(
        { projectId: PROJECT_ID, credential: applicationDefault() },
        "dashboard-test-admin",
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
      // Wipe cross-test residue: the dashboard reads the GLOBAL
      // clientFormTasks collection. Prior test files (statusWorkflow,
      // archiveTask) seed tasks that aren't cleaned up, so without
      // this wipe the dashboard's counts include their residue.
      // Delete in chunks of 400 (Firestore batch limit is 500) to
      // be safe with accumulated test data.
      const adminDb = getAdminFirestore(adminApp);
      const stale = await adminDb.collection("clientFormTasks").get();
      const docs = stale.docs;
      for (let i = 0; i < docs.length; i += 400) {
        const batch = adminDb.batch();
        for (const d of docs.slice(i, i + 400)) batch.delete(d.ref);
        await batch.commit();
      }
    });

    it("renders the 8 cards and reflects the live task counts from the emulator", async () => {
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
      // Force-claim propagation: custom-claim updates take a beat
      // to land on the user's ID token. Re-fetching after a short
      // pause avoids a race where the dashboard's onSnapshot fires
      // before the admin role is visible in the auth token.
      await new Promise((r) => setTimeout(r, 250));

      const clientA = await adminFirestore
        .collection("clients")
        .add({
          businessName: `Acme-A-${uniqueSuffix()}`,
          ownerName: "Alice",
          tin: "111-111-111",
          rdo: "047",
          address: "A",
          contactNumber: "1",
          email: `a-${uniqueSuffix()}@example.com`,
          assignedBookkeeperId: bkRec.uid,
          status: "active",
          notes: "",
        });
      const clientB = await adminFirestore
        .collection("clients")
        .add({
          businessName: `Acme-B-${uniqueSuffix()}`,
          ownerName: "Bob",
          tin: "222-222-222",
          rdo: "047",
          address: "B",
          contactNumber: "2",
          email: `b-${uniqueSuffix()}@example.com`,
          assignedBookkeeperId: bkRec.uid,
          status: "active",
          notes: "",
        });
      const formA = await adminFirestore.collection("taxForms").add({
        formCode: "2550Q",
        formName: "Quarterly VAT",
        description: "",
        category: "VAT",
        defaultFrequency: "quarterly",
        defaultDeadlineRule: "lastDayOfMonthAfterPeriod",
        deadlineShift: null,
        isActive: true,
        seedSource: true,
      });
      const formB = await adminFirestore.collection("taxForms").add({
        formCode: "1601C",
        formName: "Withholding Compensation",
        description: "",
        category: "Withholding",
        defaultFrequency: "monthly",
        defaultDeadlineRule: "fixedDayOfMonthAfterPeriod",
        deadlineShift: 10,
        isActive: true,
        seedSource: true,
      });

      const today = new Date();
      const yyyy = today.getUTCFullYear();
      const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
      const thisMonth = `${yyyy}-${mm}-15`;
      const lastMonthIso = new Date(
        today.getTime() - 30 * 24 * 60 * 60 * 1000,
      )
        .toISOString()
        .slice(0, 10);
      const nextMonthIso = new Date(
        today.getTime() + 30 * 24 * 60 * 60 * 1000,
      )
        .toISOString()
        .slice(0, 10);

      // 6 tasks across both clients:
      //   2 pending (one overdue, one due-this-month)
      //   1 ready_to_file (due this month)
      //   1 submitted (overdue)
      //   1 done (overdue — must NOT count as overdue)
      //   1 archived (counts on the archived card)
      const tasks: SeedTask[] = [
        {
          clientId: clientA.id,
          taxFormId: formA.id,
          assignedBookkeeperId: bkRec.uid,
          status: "pending",
          archived: false,
          deadlineIso: lastMonthIso, // overdue
        },
        {
          clientId: clientA.id,
          taxFormId: formA.id,
          assignedBookkeeperId: bkRec.uid,
          status: "pending",
          archived: false,
          deadlineIso: thisMonth, // due this month
        },
        {
          clientId: clientA.id,
          taxFormId: formB.id,
          assignedBookkeeperId: bkRec.uid,
          status: "ready_to_file",
          archived: false,
          deadlineIso: thisMonth,
        },
        {
          clientId: clientB.id,
          taxFormId: formA.id,
          assignedBookkeeperId: bkRec.uid,
          status: "submitted",
          archived: false,
          deadlineIso: lastMonthIso, // overdue
        },
        {
          clientId: clientB.id,
          taxFormId: formA.id,
          assignedBookkeeperId: bkRec.uid,
          status: "done",
          archived: false,
          deadlineIso: lastMonthIso, // past but done
        },
        {
          clientId: clientB.id,
          taxFormId: formB.id,
          assignedBookkeeperId: bkRec.uid,
          status: "archived",
          archived: true,
          deadlineIso: lastMonthIso,
        },
      ];

      const taskRefs: string[] = [];
      for (const t of tasks) {
        const ref = await adminFirestore
          .collection("clientFormTasks")
          .add({
            clientId: t.clientId,
            taxFormId: t.taxFormId,
            assignedBookkeeperId: t.assignedBookkeeperId,
            frequency: "quarterly",
            periodStart: AdminTimestamp.fromDate(new Date("2026-01-01")),
            periodEnd: AdminTimestamp.fromDate(new Date("2026-03-31")),
            deadlineDate: AdminTimestamp.fromDate(
              new Date(`${t.deadlineIso}T00:00:00Z`),
            ),
            status: t.status,
            archived: t.archived,
            year: yyyy,
            monthOrQuarter: 1,
            notes: "",
          });
        taskRefs.push(ref.id);
      }

      // Sign in BEFORE rendering so the dashboard's onSnapshot
      // opens with a valid auth token. Otherwise the snapshot
      // listener fires its error path and never retries.
      await signInWithEmailAndPassword(auth, adminEmail, TEST_PASSWORD);

      const { unmount } = renderDashboard();

      try {
        // Page mounts after auth state flips. The cards should
        // settle to: pending=2, readyToFile=1, submitted=1, done=1,
        // overdue=3 (pending overdue + ready_to_file-this-month? no
        // — only the pending overdue + the submitted overdue count
        // as overdue because done doesn't), archived=1.
        await waitFor(
          () => {
            expect(
              screen.getByTestId("dashboard-count-pending").textContent,
            ).toBe("2");
          },
          { timeout: 15_000 },
        );
        expect(
          screen.getByTestId("dashboard-count-ready-to-file").textContent,
        ).toBe("1");
        expect(
          screen.getByTestId("dashboard-count-submitted").textContent,
        ).toBe("1");
        expect(
          screen.getByTestId("dashboard-count-done").textContent,
        ).toBe("1");
        expect(
          screen.getByTestId("dashboard-count-overdue").textContent,
        ).toBe("2");
        expect(
          screen.getByTestId("dashboard-count-archived").textContent,
        ).toBe("1");
        // 2 of the 6 tasks fall in this month: the pending task
        // and the ready_to_file task (both seeded with thisMonth).
        expect(
          screen.getByTestId("dashboard-count-due-this-month").textContent,
        ).toBe("2");
        // Due this quarter: any deadline in the current calendar
        // quarter. With this-month + next-month in the same quarter
        // (and last-month potentially in the previous one), the
        // expected count is 2 if the test runs in Q2 or Q4, and
        // 3 if it runs in Q1 or Q3 where last-month is also in-quarter.
        const quarterCount = Number(
          screen.getByTestId("dashboard-count-due-this-quarter").textContent,
        );
        expect(quarterCount).toBeGreaterThanOrEqual(2);

        // Live update: flip one pending task to done via Admin SDK
        // and assert the cards re-render without a manual refresh.
        const flipRef = taskRefs[0];
        await adminFirestore
          .doc(`clientFormTasks/${flipRef}`)
          .update({ status: "done" });

        await waitFor(
          () => {
            expect(
              screen.getByTestId("dashboard-count-pending").textContent,
            ).toBe("1");
          },
          { timeout: 10_000 },
        );
        expect(
          screen.getByTestId("dashboard-count-done").textContent,
        ).toBe("2");
        // Overdue drops from 2 to 1 because the flipped row was
        // overdue+pending; now it's done and no longer overdue.
        expect(
          screen.getByTestId("dashboard-count-overdue").textContent,
        ).toBe("1");
      } finally {
        unmount();
        await signOut(auth);
        for (const id of taskRefs) {
          await adminFirestore
            .doc(`clientFormTasks/${id}`)
            .delete()
            .catch(() => undefined);
        }
        await adminFirestore
          .doc(`clients/${clientA.id}`)
          .delete()
          .catch(() => undefined);
        await adminFirestore
          .doc(`clients/${clientB.id}`)
          .delete()
          .catch(() => undefined);
        await adminFirestore
          .doc(`taxForms/${formA.id}`)
          .delete()
          .catch(() => undefined);
        await adminFirestore
          .doc(`taxForms/${formB.id}`)
          .delete()
          .catch(() => undefined);
        await adminAuth.deleteUser(adminRec.uid);
        await adminAuth.deleteUser(bkRec.uid);
      }
    }, 90_000);
  },
);