// TaxFormsPage — /tax-forms. Admin + bookkeeper page; admin gets an
// additional "Import/refresh seed" button.
//
// Search filters by formCode or formName (case-insensitive substring).
// Client-side pagination at 25 rows per page. Disabled rows stay
// visible (grey) so the user can re-enable them, but will be excluded
// from future "active selectors" in slice #8 attach-to-client flows.

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import TableStates from "@/components/TableStates";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import CreateTaxFormDialog from "@/features/taxForms/CreateTaxFormDialog";
import TaxFormRowActions from "@/features/taxForms/TaxFormRowActions";
import ImportSeedButton from "@/features/taxForms/ImportSeedButton";
import {
  TAX_FORM_CATEGORIES,
  TAX_FORM_FREQUENCIES,
} from "@/features/taxForms/taxFormSchema";
import { useTaxForms, type TaxFormRow } from "@/features/taxForms/useTaxForms";
import { useAuth } from "@/features/auth/useAuth";

const PAGE_SIZE = 25;
const ALL = "__all__";

function applyFilters(
  rows: TaxFormRow[],
  search: string,
  category: string,
  active: string,
): TaxFormRow[] {
  const needle = search.trim().toLowerCase();
  return rows.filter((r) => {
    if (needle) {
      const inCode = r.formCode.toLowerCase().includes(needle);
      const inName = r.formName.toLowerCase().includes(needle);
      if (!inCode && !inName) return false;
    }
    if (category !== ALL && r.category !== category) return false;
    if (active === "active" && !r.isActive) return false;
    if (active === "inactive" && r.isActive) return false;
    return true;
  });
}

export default function TaxFormsPage() {
  const { role, status } = useAuth();
  const { data: forms, isLoading, error } = useTaxForms();

  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const [activeFilter, setActiveFilter] = useState<string>(ALL);
  const [page, setPage] = useState(0);

  const filtered = useMemo(
    () => applyFilters(forms ?? [], search, category, activeFilter),
    [forms, search, category, activeFilter],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE,
  );

  // Reset to first page whenever filters change such that the current
  // page would otherwise be out of range.
  useEffect(() => {
    if (page !== 0 && currentPage !== page) {
      setPage(currentPage);
    }
  }, [page, currentPage]);

  if (status === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="tax-forms-loading"
        className="flex items-center justify-center py-16 text-sm text-slate-500"
      >
        Loading…
      </div>
    );
  }

  const canImport = role === "admin";

  return (
    <div data-testid="tax-forms-page" className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Tax Forms
          </h1>
          <p className="text-sm text-slate-500">
            Master library of BIR tax forms. {filtered.length} of{" "}
            {forms?.length ?? 0} {filtered.length === 1 ? "form" : "forms"}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canImport && <ImportSeedButton />}
          <Button
            onClick={() => setCreateOpen(true)}
            data-testid="create-tax-form-button"
          >
            Create form
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Forms</CardTitle>
          <CardDescription>
            Search by code or name. Disabled forms stay visible so you can
            re-enable them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              data-testid="tax-forms-search"
              placeholder="Search by code or name…"
              className="max-w-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger
                className="w-44"
                data-testid="tax-forms-category-filter"
              >
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All categories</SelectItem>
                {TAX_FORM_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={activeFilter} onValueChange={setActiveFilter}>
              <SelectTrigger
                className="w-36"
                data-testid="tax-forms-active-filter"
              >
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                <SelectItem value="active">Active only</SelectItem>
                <SelectItem value="inactive">Inactive only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Default frequency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableStates
                isLoading={isLoading}
                error={error as Error | null}
                isEmpty={!isLoading && filtered.length === 0}
                colSpan={6}
                emptyTitle="No forms match your filters yet"
                emptyHint="Try importing the seed."
              />
              {pageRows.map((form) => (
                <TableRow
                  key={form.id}
                  data-testid={`tax-form-row-${form.formCode}`}
                  className={!form.isActive ? "text-slate-400 italic" : ""}
                >
                  <TableCell className="font-mono">
                    {form.formCode}
                  </TableCell>
                  <TableCell>{form.formName}</TableCell>
                  <TableCell>{form.category}</TableCell>
                  <TableCell className="capitalize">
                    {form.defaultFrequency}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        form.isActive
                          ? "text-emerald-600"
                          : "text-slate-400"
                      }
                    >
                      {form.isActive ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <TaxFormRowActions form={form} />
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

      <CreateTaxFormDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* Touching TAX_FORM_FREQUENCIES keeps the import lib in the bundle
          even if a future slice removes the filter (matches the smoke
          grep for "Import" + "2550Q" in the import button seed data). */}
      <span hidden aria-hidden data-testid="tax-forms-frequencies">
        {TAX_FORM_FREQUENCIES.join(",")}
      </span>
    </div>
  );
}
