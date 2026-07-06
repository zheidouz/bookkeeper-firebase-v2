import { Outlet } from "react-router-dom";

import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

/**
 * AppShell — the layout that wraps every authenticated page.
 *
 * Layout (Tailwind):
 *   ┌─────────┬─────────────────────────────┐
 *   │ Sidebar │  TopBar (h-14)              │
 *   │ w-56    ├─────────────────────────────┤
 *   │         │  <Outlet /> (main content)  │
 *   └─────────┴─────────────────────────────┘
 *
 * Routes that need this layout are wrapped in RequireAuth + a parent
 * <Route element={<AppShell />} /> in the router config.
 */
export default function AppShell() {
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <TopBar />
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}