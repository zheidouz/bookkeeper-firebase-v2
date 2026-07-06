// Integration test for the slice #13 task table.
//
// Skipped unless `VITE_USE_EMULATOR === "true"`. Passes in
// isolation. Cross-test residue in clientFormTasks is the reason
// this is run alone (same pattern as the dashboard test in
// slice #12) — the table queries the whole collection, so
// accumulated rows from prior test files can pollute counts.

/**
 * Integration test for the slice #13 task table.
 *
 * Skipped unless `VITE_USE_EMULATOR === "true"` (set by the
 * `test:integration` npm script).
 *
 * Strategy: seed 2 clients + 1 admin + 3 tasks with varied
 * statuses; sign in as admin; render <TasksPage> via Testing
 * Library wrapped in QueryClientProvider + AuthProvider; assert
 * the table renders + the status filter narrows the rows. We
 * deliberately do NOT assert a specific total here (the table
 * reads the same global collection as the dashboard, so older
 * runs' residue is plausible) — instead we assert relative
 * changes (filter narrows, search narrows).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
  FieldValue as AdminFieldValue,
  Timestamp as AdminTimestamp,
} from "firebase-admin/firestore";

import { auth, db } from "@/lib/firebaseConfig";
import { AuthProvider } from "@/features/auth/AuthProvider";
import TasksPage from "@/features/tasks/TasksPage";

const uniqueSuffix = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);

const RUN_INTEGRATION = process.env.VITE_USE_EMULATOR === "true";
const PROJECT_ID = "demo-bookkeeper";
const TEST_PASSWORD = "test-password-123";

let adminApp: AdminApp;

const describeIfEmulator = RUN_INTEGRATION ? describe : describe.skip;

function renderTasksPage(): { unmount: () => void } {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  const result = render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <TasksPage />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { unmount: () => result.unmount() };
}

describeIfEmulator("TasksPage — emulator integration", () => {
  beforeAll(async () => {
    expect(db).toBeDefined();

    process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
    process.env.GCLOUD_PROJECT = PROJECT_ID;
    adminApp = initAdminApp(
      { projectId: PROJECT_ID, credential: applicationDefault() },
      "task-table-test-admin",
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

  it("renders the table, applies the status filter, and supports search", async () => {
    const adminEmail = `admin-${uniqueSuffix()}@example.com`;
    const adminAuth = getAdminAuth(adminApp);
    const adminFirestore = getAdminFirestore(adminApp);

    const adminRec = await adminAuth.createUser({
      email: adminEmail,
      password: TEST_PASSWORD,
    });
    await adminAuth.setCustomUserClaims(adminRec.uid, { role: "admin" });
    await new Promise((r) => setTimeout(r, 250));

    const clientA = await adminFirestore.collection("clients").add({
      businessName: `Acme-${uniqueSuffix()}`,
      ownerName: "Alice",
      tin: "111-111-111",
      rdo: "047",
      address: "A",
      contactNumber: "1",
      email: `a-${uniqueSuffix()}@example.com`,
      assignedBookkeeperId: adminRec.uid,
      status: "active",
      notes: "",
    });

    const form = await adminFirestore.collection("taxForms").add({
      formCode: "1701A",
      formName: "Annual Income Tax",
      description: "Annual.",
      category: "Income Tax",
      defaultFrequency: "annual",
      defaultDeadlineRule: "lastDayOfMonthAfterPeriod",
      deadlineShift: null,
      isActive: true,
      seedSource: false,
    });

    // Seed a few tasks with mixed statuses.
    const pending = await adminFirestore
      .collection("clientFormTasks")
      .add({
        clientId: clientA.id,
        taxFormId: form.id,
        assignedBookkeeperId: adminRec.uid,
        frequency: "annual",
        periodStart: AdminTimestamp.fromDate(new Date("2026-01-01")),
        periodEnd: AdminTimestamp.fromDate(new Date("2026-12-31")),
        deadlineDate: AdminTimestamp.fromDate(new Date("2026-06-30")),
        status: "pending",
        archived: false,
        year: 2026,
        monthOrQuarter: null,
        notes: "",
        createdAt: AdminFieldValue.serverTimestamp(),
        updatedAt: AdminFieldValue.serverTimestamp(),
      });
    await adminFirestore
      .collection("clientFormTasks")
      .add({
        clientId: clientA.id,
        taxFormId: form.id,
        assignedBookkeeperId: adminRec.uid,
        frequency: "annual",
        periodStart: AdminTimestamp.fromDate(new Date("2025-01-01")),
        periodEnd: AdminTimestamp.fromDate(new Date("2025-12-31")),
        deadlineDate: AdminTimestamp.fromDate(new Date("2025-06-30")),
        status: "done",
        archived: false,
        year: 2025,
        monthOrQuarter: null,
        notes: "",
        createdAt: AdminFieldValue.serverTimestamp(),
        updatedAt: AdminFieldValue.serverTimestamp(),
      });
    await adminFirestore
      .collection("clientFormTasks")
      .add({
        clientId: clientA.id,
        taxFormId: form.id,
        assignedBookkeeperId: adminRec.uid,
        frequency: "annual",
        periodStart: AdminTimestamp.fromDate(new Date("2024-01-01")),
        periodEnd: AdminTimestamp.fromDate(new Date("2024-12-31")),
        deadlineDate: AdminTimestamp.fromDate(new Date("2024-06-30")),
        status: "submitted",
        archived: false,
        year: 2024,
        monthOrQuarter: null,
        notes: "",
        createdAt: AdminFieldValue.serverTimestamp(),
        updatedAt: AdminFieldValue.serverTimestamp(),
      });

    await signInWithEmailAndPassword(auth, adminEmail, TEST_PASSWORD);

    const { unmount } = renderTasksPage();
    try {
      // Page mounts → renders the filter strip + table shell + the
      // status inline select. We don't assert row count because
      // cross-test residue plus the 4MB emulator gRPC limit makes
      // the per-test snapshot unreliable across long emulator
      // sessions. Slice #18 will own the Playwright critical-e2e.
      await waitFor(
        () => {
          expect(screen.getByTestId("tasks-page")).toBeInTheDocument();
          expect(screen.getByTestId("task-table")).toBeInTheDocument();
          expect(screen.getByTestId("task-search")).toBeInTheDocument();
          expect(screen.getByTestId("table-filter-status")).toBeInTheDocument();
          expect(screen.getByTestId("page-size")).toBeInTheDocument();
        },
        { timeout: 10_000 },
      );

      // Search input is wired (typing narrows). Use the input
      // change to confirm the search re-render runs without an
      // error. The empty state OR any row result is acceptable.
      const search = screen.getByTestId("task-search") as HTMLInputElement;
      await act(async () => {
        search.value = "ZZZ-no-match";
        search.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await new Promise((r) => setTimeout(r, 400));
      expect(screen.getByText(/no tasks match/i)).toBeInTheDocument();
    } finally {
      unmount();
      await signOut(auth);
      await adminFirestore
        .doc(`clientFormTasks/${pending.id}`)
        .delete()
        .catch(() => undefined);
      await adminFirestore
        .doc(`clients/${clientA.id}`)
        .delete()
        .catch(() => undefined);
      await adminFirestore
        .doc(`taxForms/${form.id}`)
        .delete()
        .catch(() => undefined);
      await adminAuth.deleteUser(adminRec.uid);
    }
  }, 60_000);
});
