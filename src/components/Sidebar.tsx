import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard" },
  { to: "/clients", label: "Clients" },
  { to: "/tax-forms", label: "Tax Forms" },
  { to: "/tasks", label: "Tasks" },
  { to: "/archive", label: "Archive" },
  { to: "/users", label: "Users" },
  { to: "/settings", label: "Settings" },
];

export default function Sidebar() {
  return (
    <aside
      data-testid="sidebar"
      className="flex h-screen w-56 flex-col bg-slate-900 text-white"
    >
      <div className="border-b border-slate-800 px-4 py-4 text-lg font-semibold">
        Bookkeeper
      </div>
      <nav className="flex-1 space-y-1 px-2 py-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            data-testid={`sidebar-link-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
            className={({ isActive }) =>
              cn(
                "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-slate-700 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white",
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-800 px-4 py-3 text-xs text-slate-400">
        Issue #3 · auth shell
      </div>
    </aside>
  );
}