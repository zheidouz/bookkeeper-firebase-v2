// AttachedFormsSection — slice #8. Renders the "Attached forms"
// Card on /clients/:id. The card is fed by useClientFormTasks and
// joins the tax form code/name from the taxForms cache. The Attach
// button opens AttachFormDialog; per-row Edit / Remove live in
// AttachedTaskRow.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { useAuth } from "@/features/auth/useAuth";
import AttachFormDialog from "@/features/clientFormTasks/AttachFormDialog";
import AttachedTaskRow from "@/features/clientFormTasks/AttachedTaskRow";
import { useClientFormTasks } from "@/features/clientFormTasks/useClientFormTasks";
import { useTaxForms } from "@/features/taxForms/useTaxForms";
import type { ClientDetail } from "@/features/clients/useClient";

interface AttachedFormsSectionProps {
  client: ClientDetail;
}

export default function AttachedFormsSection({
  client,
}: AttachedFormsSectionProps) {
  const { role } = useAuth();
  const { data: tasks } = useClientFormTasks(client.id);
  const { data: taxForms } = useTaxForms();
  const [attachOpen, setAttachOpen] = useState(false);

  const canWrite = role === "admin" || role === "bookkeeper";

  const formMap = useMemo(() => {
    const m = new Map<string, (typeof taxForms extends (infer T)[] | undefined ? T : never)>();
    (taxForms ?? []).forEach((f) => m.set(f.id, f));
    return m;
  }, [taxForms]);

  return (
    <>
      <Card data-testid="attached-forms-section">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Attached forms</CardTitle>
            <CardDescription>
              Tax forms filed for this client.
            </CardDescription>
          </div>
          {canWrite && (
            <Button
              onClick={() => setAttachOpen(true)}
              data-testid="attach-form-button"
              size="sm"
            >
              Attach form
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {!tasks || tasks.length === 0 ? (
            <div
              data-testid="attached-forms-empty"
              className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500"
            >
              No forms attached yet.{" "}
              {canWrite ? (
                <button
                  type="button"
                  onClick={() => setAttachOpen(true)}
                  className="font-medium text-slate-700 underline"
                >
                  Click &quot;Attach form&quot;
                </button>
              ) : (
                <span>A bookkeeper can attach a form to start tracking.</span>
              )}{" "}
              to track a tax obligation.
            </div>
          ) : (
            <div
              data-testid="attached-forms-table"
              className="overflow-x-auto"
            >
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Form</th>
                    <th className="px-3 py-2">Frequency</th>
                    <th className="px-3 py-2">Period</th>
                    <th className="px-3 py-2">Deadline</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => (
                    <AttachedTaskRow
                      key={t.id}
                      task={t}
                      taxForm={formMap.get(t.taxFormId)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tasks && tasks.length > 0 && !canWrite && (
            <p className="mt-3 text-xs text-slate-400">
              Need to make changes?{" "}
              <Link to="/clients" className="underline">
                Return to the client list
              </Link>{" "}
              and ask a bookkeeper.
            </p>
          )}
        </CardContent>
      </Card>

      {canWrite && (
        <AttachFormDialog
          clientId={client.id}
          defaultBookkeeperId={client.assignedBookkeeperId}
          open={attachOpen}
          onOpenChange={setAttachOpen}
        />
      )}
    </>
  );
}
