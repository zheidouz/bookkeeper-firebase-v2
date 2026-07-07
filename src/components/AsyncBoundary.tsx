// AsyncBoundary — slice #18.
//
// Wraps a list view's loading + error + empty states into a single
// component so the pages stay terse and the load/error/empty UX is
// consistent across the app.
//
// Usage:
//   <AsyncBoundary
//     isLoading={isLoading}
//     error={error}
//     isEmpty={filtered.length === 0}
//     onRetry={refetch}
//     emptyTitle="No clients yet"
//     emptyBody="Add your first client from the dashboard."
//   >
//     <List rows={filtered} />
//   </AsyncBoundary>
//
// Each state renders a distinct `data-testid` so Playwright /
// vitest can pin to it precisely without relying on text.

import { AlertCircle, Inbox, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface AsyncBoundaryProps {
  /** True on the first render of the underlying query. */
  isLoading: boolean;
  /** An Error thrown by the query (e.g. rules-engine PERMISSION_DENIED). */
  error?: Error | null;
  /** True when the data has loaded successfully AND the list is empty. */
  isEmpty: boolean;
  /** Called when the user clicks the inline "Try again" button. */
  onRetry?: () => void;
  /** Title shown in the empty state. */
  emptyTitle: string;
  /** Body sentence for the empty state. */
  emptyBody: string;
  /** Number of skeleton rows to render while loading. */
  skeletonRows?: number;
  /** Override the wrapper's className (used by Tailwind layout). */
  className?: string;
  /** The content to render on success. */
  children: React.ReactNode;
}

const SKELETON_DEFAULT_ROWS = 4;

export default function AsyncBoundary({
  isLoading,
  error,
  isEmpty,
  onRetry,
  emptyTitle,
  emptyBody,
  skeletonRows = SKELETON_DEFAULT_ROWS,
  className,
  children,
}: AsyncBoundaryProps) {
  // 1. Error state wins over loading (otherwise we hide PERMISSION_DENIED
  //    behind a spinner).
  if (error) {
    return (
      <Card
        data-testid="async-boundary-error"
        className={cn(
          "flex items-start gap-3 border-rose-200 bg-rose-50 p-4 text-rose-900",
          className,
        )}
      >
        <AlertCircle className="mt-0.5 h-5 w-5 flex-none" aria-hidden />
        <div className="flex-1">
          <div className="text-sm font-semibold">
            Couldn’t load this view
          </div>
          <div className="mt-1 text-xs">
            {error.message || "An unexpected error occurred."}
          </div>
        </div>
        {onRetry ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            data-testid="async-boundary-retry"
          >
            Try again
          </Button>
        ) : null}
      </Card>
    );
  }

  // 2. Loading state.
  if (isLoading) {
    return (
      <div
        data-testid="async-boundary-loading"
        className={cn("space-y-2", className)}
        aria-busy="true"
      >
        <div
          className="flex items-center gap-2 text-xs text-slate-500"
          data-testid="async-boundary-loading-label"
        >
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          Loading…
        </div>
        <div data-testid="async-boundary-skeleton-list">
          {Array.from({ length: skeletonRows }).map((_, i) => (
            <div
              key={i}
              className="mb-2 h-10 animate-pulse rounded-md bg-slate-100"
            />
          ))}
        </div>
      </div>
    );
  }

  // 3. Empty state.
  if (isEmpty) {
    return (
      <Card
        data-testid="async-boundary-empty"
        className={cn("p-8 text-center text-slate-500", className)}
      >
        <Inbox
          className="mx-auto mb-2 h-8 w-8 text-slate-300"
          aria-hidden
        />
        <div className="text-sm font-medium text-slate-700">
          {emptyTitle}
        </div>
        <div className="mt-1 text-xs">{emptyBody}</div>
      </Card>
    );
  }

  // 4. Success — render the children inside a tagged wrapper so
  //    Playwright can wait for `data-testid="async-boundary-content"`.
  return (
    <div
      data-testid="async-boundary-content"
      className={className}
    >
      {children}
    </div>
  );
}
