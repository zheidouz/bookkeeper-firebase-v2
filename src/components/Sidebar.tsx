import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  /** Hidden from the sidebar but kept here for tests/links. */
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard" },
  { to: "/clients", label: "Clients" },
  { to: "/tax-forms", label: "Tax Forms" },
  { to: "/tasks", label: "Tasks" },
  { to: "/archive", label: "Archive" },
  { to: "/users", label: "Users", adminOnly: true },
  { to: "/settings", label: "Settings" },
];

/**
 * Sidebar — slice #18 polish pass.
 *
 * - Desktop (>= md): persistent left column, w-56, full-height.
 * - Mobile (< md): collapsed; a hamburger button in the top-bar
 *   toggles a slide-in overlay.
 * - Each `<NavLink>` is keyboard-focusable via the standard
 *   `<a>` semantics; the active route gets `aria-current="page"`
 *   automatically from React Router.
 * - The container is marked with `data-testid="sidebar"` for
 *   Playwright / vitest; each link gets
 *   `data-testid="sidebar-link-<slug>"`.
 */
export default function Sidebar() {
  const [open, setOpen] = useState(false);
  // Close the drawer when the route changes (so navigating from
  // inside the drawer doesn't leave it open on the new page).
  // We rely on React Router updating `location`; the simplest way
  // is to close on any click — it's a one-line shortcut that
  // matches user expectation.
  function closeOnNavigate() {
    setOpen(false);
  }

  // Close the drawer when the viewport widens past the mobile
  // breakpoint (avoids a stuck-open drawer if the user rotates a
  // tablet from portrait to landscape).
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onResize() {
      if (window.innerWidth >= 768) setOpen(false);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <>
      {/* Mobile toggle lives in the same plane as the sidebar so the
          desktop layout is unaffected. It's hidden >= md. */}
      <button
        type="button"
        aria-label="Open navigation"
        aria-expanded={open}
        aria-controls="sidebar-drawer"
        onClick={() => setOpen((v) => !v)}
        className="fixed left-3 top-3 z-40 inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 md:hidden"
        data-testid="sidebar-toggle"
      >
        {open ? (
          <X className="h-5 w-5" aria-hidden />
        ) : (
          <Menu className="h-5 w-5" aria-hidden />
        )}
      </button>

      {/* Overlay catches click-outside-to-close on mobile. */}
      {open ? (
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          data-testid="sidebar-overlay"
        />
      ) : null}

      {/* The sidebar itself. Always rendered; on desktop it's the
          column, on mobile it's a slide-in drawer controlled by
          `open`. */}
      <aside
        id="sidebar-drawer"
        data-testid="sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-56 flex-col bg-slate-900 text-white transition-transform duration-200 ease-out md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
        aria-label="Primary"
      >
        <div
          className="border-b border-slate-800 px-4 py-4 text-lg font-semibold"
          data-testid="sidebar-brand"
        >
          Bookkeeper
        </div>
        <nav
          className="flex-1 space-y-1 px-2 py-3"
          aria-label="Sections"
        >
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={closeOnNavigate}
              data-testid={`sidebar-link-${item.label
                .toLowerCase()
                .replace(/\s+/g, "-")}`}
              className={({ isActive }) =>
                cn(
                  "block rounded-md px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white",
                  isActive
                    ? "bg-slate-700 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white",
                )
              }
            >
              {item.label}
              {item.adminOnly ? (
                <span className="ml-1 text-[10px] uppercase tracking-wide text-slate-500">
                  admin
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <div
          className="border-t border-slate-800 px-4 py-3 text-xs text-slate-400"
          data-testid="sidebar-footer"
        >
          Bookkeeper Dashboard · v1
        </div>
      </aside>
    </>
  );
}
