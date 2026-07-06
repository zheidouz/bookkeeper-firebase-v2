// ClientDetailPage — /clients/:id. Renders the full client record in
// read-only form, plus an Edit button (bookkeeper+admin) that opens
// EditClientDialog. The "Attached forms" section is a static empty
// state — slice #8 (attach-to-client) populates this list.

import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import EditClientDialog from "@/features/clients/EditClientDialog";
import { useClient } from "@/features/clients/useClient";
import { useBookkeepers } from "@/features/clients/useBookkeepers";
import { useAuth } from "@/features/auth/useAuth";

function bookkeeperLabel(
  id: string | undefined,
  map: Map<string, string>,
): string {
  if (!id) return "—";
  return map.get(id) ?? id;
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { role, status: authStatus } = useAuth();
  const { data: client, isLoading } = useClient(id);
  const { data: bookkeepers } = useBookkeepers();
  const [editOpen, setEditOpen] = useState(false);

  if (authStatus === "loading" || isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="client-detail-loading"
        className="flex items-center justify-center py-16 text-sm text-slate-500"
      >
        Loading…
      </div>
    );
  }

  if (!client) {
    return (
      <div
        data-testid="client-detail-missing"
        className="space-y-3 py-16 text-center text-sm text-slate-500"
      >
        <p>This client doesn&apos;t exist or you don&apos;t have access.</p>
        <Button asChild variant="outline" size="sm">
          <Link to="/clients">Back to clients</Link>
        </Button>
      </div>
    );
  }

  const canWrite = role === "admin" || role === "bookkeeper";
  const bookkeeperMap = new Map<string, string>();
  (bookkeepers ?? []).forEach((b) =>
    bookkeeperMap.set(b.id, b.name || b.email),
  );

  return (
    <div data-testid="client-detail-page" className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link to="/clients">← Back to clients</Link>
          </Button>
          <h1 className="text-2xl font-semibold text-slate-900">
            {client.businessName}
          </h1>
          <p className="text-sm text-slate-500">
            Client detail · {client.tin}
          </p>
        </div>
        {canWrite && (
          <Button
            onClick={() => setEditOpen(true)}
            data-testid="client-detail-edit"
          >
            Edit client
          </Button>
        )}
      </header>

      {client.status === "archived" && (
        <div
          role="alert"
          data-testid="client-detail-archived-banner"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          This client is archived. Restore from the list to make them active
          again.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Client details</CardTitle>
          <CardDescription>
            Read-only summary. Edit updates flow through to the table.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl
            className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2"
            data-testid="client-detail-fields"
          >
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Business name
              </dt>
              <dd className="text-sm font-medium text-slate-900">
                {client.businessName}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Owner name
              </dt>
              <dd className="text-sm text-slate-900">{client.ownerName}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                TIN
              </dt>
              <dd className="font-mono text-sm text-slate-900">{client.tin}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                RDO code
              </dt>
              <dd className="text-sm text-slate-900">{client.rdo}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Address
              </dt>
              <dd className="text-sm text-slate-900">{client.address}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Contact number
              </dt>
              <dd className="text-sm text-slate-900">{client.contactNumber}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Email
              </dt>
              <dd className="text-sm text-slate-900">{client.email}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Assigned bookkeeper
              </dt>
              <dd className="text-sm text-slate-900">
                {bookkeeperLabel(client.assignedBookkeeperId, bookkeeperMap)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Status
              </dt>
              <dd className="text-sm">
                <span
                  className={
                    client.status === "active"
                      ? "text-emerald-600"
                      : client.status === "inactive"
                        ? "text-slate-500"
                        : "text-rose-500"
                  }
                >
                  {client.status}
                </span>
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Notes
              </dt>
              <dd className="whitespace-pre-wrap text-sm text-slate-900">
                {client.notes || "—"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attached forms</CardTitle>
          <CardDescription>
            Tax forms filed for this client.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            data-testid="client-detail-attached-empty"
            className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500"
          >
            No forms attached yet. Slice #8 will populate this.
          </div>
        </CardContent>
      </Card>

      {canWrite && (
        <EditClientDialog
          client={{
            id: client.id,
            businessName: client.businessName,
            ownerName: client.ownerName,
            tin: client.tin,
            rdo: client.rdo,
            address: client.address,
            contactNumber: client.contactNumber,
            email: client.email,
            assignedBookkeeperId: client.assignedBookkeeperId,
            status: client.status,
            notes: client.notes,
            createdAt: client.createdAt,
            updatedAt: client.updatedAt,
          }}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
    </div>
  );
}
