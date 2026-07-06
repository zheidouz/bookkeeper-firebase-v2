import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";

import AppShell from "@/components/AppShell";
import LoginPage from "@/features/auth/LoginPage";
import RequireAuth from "@/features/auth/RequireAuth";
import NotFound from "@/routes/NotFound";
import DashboardPage from "@/features/dashboard/DashboardPage";
import UsersPage from "@/features/users/UsersPage";
import TaxFormsPage from "@/features/taxForms/TaxFormsPage";
import ClientsPage from "@/features/clients/ClientsPage";
import ClientDetailPage from "@/features/clients/ClientDetailPage";

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
          { path: "/tasks", element: <NotFound /> },
          { path: "/archive", element: <NotFound /> },
          { path: "/users", element: <UsersPage /> },
          { path: "/settings", element: <NotFound /> },
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
