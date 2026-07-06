import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";

import AppShell from "@/components/AppShell";
import LoginPage from "@/features/auth/LoginPage";
import RequireAuth from "@/features/auth/RequireAuth";
import DashboardPlaceholder from "@/routes/DashboardPlaceholder";
import NotFound from "@/routes/NotFound";

/**
 * App-wide router.
 *
 *   /login              public           → LoginPage
 *   /                   protected (shell) → DashboardPlaceholder
 *   /clients ...        protected (shell) → NotFound (placeholder)
 *   *                   protected (shell) → NotFound
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
          { path: "/", element: <DashboardPlaceholder /> },
          { path: "/clients", element: <NotFound /> },
          { path: "/tax-forms", element: <NotFound /> },
          { path: "/tasks", element: <NotFound /> },
          { path: "/archive", element: <NotFound /> },
          { path: "/users", element: <NotFound /> },
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