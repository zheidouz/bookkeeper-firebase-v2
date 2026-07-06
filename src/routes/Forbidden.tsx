// Forbidden — shown to non-admins who land on /users.

import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <div
      data-testid="forbidden"
      className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 py-16 text-center"
    >
      <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Forbidden
      </div>
      <h2 className="text-2xl font-semibold text-slate-900">
        You don&apos;t have access to this page
      </h2>
      <p className="max-w-sm text-sm text-slate-600">
        User management is restricted to firm admins. If you think this is a
        mistake, ask an admin to update your role.
      </p>
      <Button asChild variant="outline" size="sm">
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}