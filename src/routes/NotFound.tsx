import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

/**
 * Placeholder 404. Lives inside AppShell so the user still has the top bar
 * (with logout) when they hit an unimplemented route.
 */
export default function NotFound() {
  return (
    <div
      data-testid="not-found"
      className="flex flex-col items-center justify-center gap-3 py-16 text-center"
    >
      <div className="text-4xl font-bold text-slate-900">404</div>
      <p className="max-w-md text-sm text-slate-600">
        This page doesn&apos;t exist yet. Later slices will fill in
        dashboard / clients / tax-forms / tasks / archive / users / settings.
      </p>
      <Button asChild variant="outline" size="sm">
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}