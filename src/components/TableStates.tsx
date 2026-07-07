// TableStates — slice #18.
//
// Drop-in row-cell replacement for tables: pass loading + error +
// empty flags and it renders a single full-width <td> with the
// right state. Used by ClientsPage, UsersPage, TaxFormsPage, etc.,
// so the in-table state UX matches the page-level AsyncBoundary.
//
// Usage:
//   <TableBody>
//     <TableStates
//       isLoading={isLoading}
//       error={error}
//       isEmpty={filtered.length === 0}
//       colSpan={7}
//       emptyTitle="No clients yet"
//     />
//     {filtered.map(...)}
//   </TableBody>

import { TableCell, TableRow } from "@/components/ui/table";
import { AlertCircle, Inbox, Loader2 } from "lucide-react";

export interface TableStatesProps {
  isLoading: boolean;
  error?: Error | null;
  isEmpty: boolean;
  colSpan: number;
  emptyTitle: string;
  emptyHint?: string;
}

export default function TableStates({
  isLoading,
  error,
  isEmpty,
  colSpan,
  emptyTitle,
  emptyHint,
}: TableStatesProps) {
  if (error) {
    return (
      <TableRow data-testid="table-state-error">
        <TableCell
          colSpan={colSpan}
          className="border-l-4 border-rose-300 bg-rose-50 py-6 text-rose-700"
        >
          <div className="flex items-start gap-2 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
            <div>
              <div className="font-medium">Couldn’t load this table</div>
              <div className="mt-0.5 text-xs">{error.message}</div>
            </div>
          </div>
        </TableCell>
      </TableRow>
    );
  }
  if (isLoading) {
    return (
      <TableRow data-testid="table-state-loading">
        <TableCell
          colSpan={colSpan}
          className="py-6 text-center text-slate-500"
        >
          <div className="inline-flex items-center gap-2 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Loading…
          </div>
        </TableCell>
      </TableRow>
    );
  }
  if (isEmpty) {
    return (
      <TableRow data-testid="table-state-empty">
        <TableCell
          colSpan={colSpan}
          className="py-8 text-center text-slate-500"
        >
          <div className="inline-flex flex-col items-center gap-1">
            <Inbox className="h-5 w-5 text-slate-300" aria-hidden />
            <div className="text-sm font-medium text-slate-700">
              {emptyTitle}
            </div>
            {emptyHint ? (
              <div className="text-xs">{emptyHint}</div>
            ) : null}
          </div>
        </TableCell>
      </TableRow>
    );
  }
  return null;
}
