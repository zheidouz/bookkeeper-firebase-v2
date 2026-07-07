import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { lazy, Suspense } from "react";

import AppShell from "@/components/AppShell";
import LoginPage from "@/features/auth/LoginPage";
import RequireAuth from "@/features/auth/RequireAuth";
import NotFound from "@/routes/NotFound";
import SettingsPlaceholder from "@/routes/SettingsPlaceholder";
import DashboardPage from "@/features/dashboard/DashboardPage";
import UsersPage from "@/features/users/UsersPage";
import TaxFormsPage from "@/features/taxForms/TaxFormsPage";
import ClientsPage from "@/features/clients/ClientsPage";
import ClientDetailPage from "@/features/clients/ClientDetailPage";

// Slice #13 lazy-loads the task table so the main bundle stays
// light (the table brings in DashboardFilters, shadcn Table +
// DropdownMenu, and StatusBadge). A Suspense wrapper around the
// element shows a skeleton while the chunk fetches.
const TasksPage = lazy(() => import("@/features/tasks/TasksPage"));
const TaskDetailPage = lazy(() => import("@/features/tasks/TaskDetailPage"));
const ArchivePage = lazy(() => import("@/features/archive/ArchivePage"));

function TasksPageWithSuspense() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading tasks…</div>}>
      <TasksPage />
    </Suspense>
  );
}

function TaskDetailPageWithSuspense() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading task…</div>}>
      <TaskDetailPage />
    </Suspense>
  );
}

function ArchivePageWithSuspense() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading archive…</div>}>
      <ArchivePage />
    </Suspense>
  );
}

/**
 * App-wide router.
 *
 *   /login                          public           → LoginPage
 *   /                               protected (shell) → DashboardPlaceholder
 *   /clients                        protected (shell) → ClientsPage
 *   /clients/:id                    protected (shell) → ClientDetailPage
 *   /tax-forms                      protected (shell) → TaxFormsPage
 *   /tasks, /archive, /settings     protected (shell) → NotFound (placeholder)
 *   *                               protected (shell) → NotFound
 *
 * Note: /login intentionally sits OUTSIDE the RequireAuth + AppShell wrapper
 * so authenticated users who land on it are bounced to "/" by LoginPage's own
 * internal <Navigate />, and unauthenticated users don't see a sidebar.
 */
const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "/", element: <DashboardPage /> },
          { path: "/clients", element: <ClientsPage /> },
          { path: "/clients/:id", element: <ClientDetailPage /> },
          { path: "/tax-forms", element: <TaxFormsPage /> },
          { path: "/tasks", element: <TasksPageWithSuspense /> },
          { path: "/tasks/:taskId", element: <TaskDetailPageWithSuspense /> },
          { path: "/archive", element: <ArchivePageWithSuspense /> },
          { path: "/users", element: <UsersPage /> },
          { path: "/settings", element: <SettingsPlaceholder /> },
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
