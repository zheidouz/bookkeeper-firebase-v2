// SettingsPlaceholder — slice #18.
//
// The Settings route is a known future home for firm-wide
// preferences (per-bookkeeper capacity, default tax forms, BIR
// holiday refresh button, role matrix editor). For v1 the page
// renders the AppShell's content area with a single "coming soon"
// card so the sidebar link doesn't dead-end or break the layout.

import { Settings as SettingsIcon } from "lucide-react";

import { Card } from "@/components/ui/card";

export default function SettingsPlaceholder() {
  return (
    <div
      data-testid="settings-page"
      className="mx-auto max-w-2xl"
    >
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-slate-900">
          Settings
        </h1>
      </div>
      <Card
        data-testid="settings-coming-soon"
        className="flex flex-col items-center gap-2 p-8 text-center text-slate-500"
      >
        <SettingsIcon
          className="h-8 w-8 text-slate-300"
          aria-hidden
        />
        <div className="text-sm font-medium text-slate-700">
          Coming soon
        </div>
        <p className="text-xs">
          Firm-wide preferences (default tax forms, BIR holiday
          refresh, per-bookkeeper capacity) land in v1.1. The
          sidebar already wires this route so you can navigate here.
        </p>
      </Card>
    </div>
  );
}
