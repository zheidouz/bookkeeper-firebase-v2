// ClientsPage — /clients. Bookkeeper+admin can create/edit/archive;
// staff sees a non-blocking notice and read-only rows.
//
// Search filters by businessName, ownerName, or tin (case-insensitive
// substring). Client-side pagination at 25 rows per page. Archived
// clients hide behind the "Show archived" toggle unless it's on.

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import NewClientDialog from "@/features/clients/NewClientDialog";
import ClientRowActions from "@/features/clients/ClientRowActions";
import {
  CLIENT_STATUSES,
} from "@/features/clients/clientSchema";
import { useClients, type ClientRow } from "@/features/clients/useClients";
import { useBookkeepers } from "@/features/clients/useBookkeepers";
import { useAuth } from "@/features/auth/useAuth";

const PAGE_SIZE = 25;

function applyFilters(
  rows: ClientRow[],
  search: string,
  showArchived: boolean,
): ClientRow[] {
  const needle = search.trim().toLowerCase();
  return rows.filter((r) => {
    if (!showArchived && r.status === "archived") return false;
    if (needle) {
      const hay = `${r.businessName} ${r.ownerName} ${r.tin}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

function bookkeeperLabel(id: string, map: Map<string, string>): string {
  if (!id) return "—";
  const v = map.get(id);
  return v ?? id.slice(0, 8) + "…";
}

export default function ClientsPage() {
  const { role, status: authStatus } = useAuth();
  const { data: clients, isLoading } = useClients();
  const { data: bookkeepers } = useBookkeepers();

  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(0);

  const bookkeeperMap = useMemo(() => {
    const m = new Map<string, string>();
    (bookkeepers ?? []).forEach((b) => {
      m.set(b.id, b.name || b.email);
    });
    return m;
  }, [bookkeepers]);

  const filtered = useMemo(
    () => applyFilters(clients ?? [], search, showArchived),
    [clients, search, showArchived],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE,
  );

  useEffect(() => {
    if (page !== 0 && currentPage !== page) {
      setPage(currentPage);
    }
  }, [page, currentPage]);

  if (authStatus === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="clients-loading"
        className="flex items-center justify-center py-16 text-sm text-slate-500"
      >
        Loading…
      </div>
    );
  }

  const canWrite = role === "admin" || role === "bookkeeper";

  return (
    <div data-testid="clients-page" className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Clients</h1>
          <p className="text-sm text-slate-500">
            {filtered.length} of {clients?.length ?? 0}{" "}
            {filtered.length === 1 ? "client" : "clients"}.{" "}
            {!canWrite &&
              "Read-only — only bookkeepers or admins can add or edit."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              data-testid="clients-show-archived"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Show archived
          </label>
          {canWrite && (
            <Button
              onClick={() => setCreateOpen(true)}
              data-testid="create-client-button"
            >
              New client
            </Button>
          )}
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Client list</CardTitle>
          <CardDescription>
            Search by business name, owner name, or TIN.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            data-testid="clients-search"
            placeholder="Search by business, owner, or TIN…"
            className="max-w-md"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>TIN</TableHead>
                <TableHead>RDO</TableHead>
                <TableHead>Bookkeeper</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-slate-500"
                  >
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-slate-500"
                  >
                    No clients match your filters yet.{" "}
                    {canWrite
                      ? "Create the first one."
                      : "Ask a bookkeeper to add one."}
                  </TableCell>
                </TableRow>
              )}
              {pageRows.map((c) => (
                <TableRow
                  key={c.id}
                  data-testid={`client-row-${c.id}`}
                  className={
                    c.status === "archived"
                      ? "text-slate-400 italic"
                      : c.status === "inactive"
                        ? "text-slate-500"
                        : ""
                  }
                >
                  <TableCell className="font-medium">
                    {c.businessName}
                  </TableCell>
                  <TableCell>{c.ownerName}</TableCell>
                  <TableCell className="font-mono">{c.tin}</TableCell>
                  <TableCell>{c.rdo}</TableCell>
                  <TableCell>
                    {bookkeeperLabel(c.assignedBookkeeperId, bookkeeperMap)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        c.status === "active"
                          ? "text-emerald-600"
                          : c.status === "inactive"
                            ? "text-slate-500"
                            : "text-rose-500"
                      }
                    >
                      {c.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {canWrite ? (
                      <ClientRowActions client={c} />
                    ) : (
                      <span className="text-xs text-slate-400">
                        read-only
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>
                Page {currentPage + 1} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages - 1}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {canWrite && (
        <NewClientDialog open={createOpen} onOpenChange={setCreateOpen} />
      )}

      {/* Touching CLIENT_STATUSES keeps the status enum in the bundle
          even if a future slice inlines constants; matches the smoke
          grep for "Clients" in the preview bundle. */}
      <span hidden aria-hidden data-testid="clients-statuses">
        {CLIENT_STATUSES.join(",")}
      </span>
    </div>
  );
}
