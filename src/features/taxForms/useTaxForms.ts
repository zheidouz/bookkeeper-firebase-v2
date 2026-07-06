// useTaxForms — TanStack Query + onSnapshot bridge for /taxForms.
//
// Same pattern as useUsers: a no-op queryFn (returns []) so TanStack
// Query owns loading/error shape, plus a useEffect that opens an
// onSnapshot and pushes snapshot rows into the cache. The page reads
// from the cache; the import button uses the cached rows as the "existing"
// input to mergeSeedForms.

import { useEffect } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  type Timestamp,
} from "firebase/firestore";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { db } from "@/lib/firebaseConfig";

import type {
  TaxFrequency,
  DeadlineRule,
  TaxFormCategory,
} from "@/lib/mergeSeedForms";

export interface TaxFormRow {
  id: string;
  formCode: string;
  formName: string;
  description: string;
  category: TaxFormCategory;
  defaultFrequency: TaxFrequency;
  defaultDeadlineRule: DeadlineRule;
  deadlineShift: number | null;
  isActive: boolean;
  seedSource?: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export const TAX_FORMS_QUERY_KEY = ["taxForms"] as const;

/** Minimal existing-row shape expected by mergeSeedForms. */
export type TaxFormExistingRow = Pick<
  TaxFormRow,
  | "formCode"
  | "formName"
  | "description"
  | "category"
  | "defaultFrequency"
  | "defaultDeadlineRule"
  | "deadlineShift"
  | "isActive"
  | "seedSource"
  | "createdAt"
>;

/**
 * Project a query-cached TaxFormRow[] down to the shape mergeSeedForms
 * needs. Centralized here so the merge logic stays free of UI types.
 */
export function asExistingTaxForms(
  rows: TaxFormRow[] | undefined
): TaxFormExistingRow[] {
  if (!rows) return [];
  return rows.map((r) => ({
    formCode: r.formCode,
    formName: r.formName,
    description: r.description,
    category: r.category,
    defaultFrequency: r.defaultFrequency,
    defaultDeadlineRule: r.defaultDeadlineRule,
    deadlineShift: r.deadlineShift ?? null,
    isActive: r.isActive,
    seedSource: r.seedSource,
    createdAt: r.createdAt,
  }));
}

export function useTaxForms() {
  const qc = useQueryClient();

  useEffect(() => {
    const q = query(collection(db, "taxForms"), orderBy("formCode", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: TaxFormRow[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            formCode: String(data.formCode ?? ""),
            formName: String(data.formName ?? ""),
            description: String(data.description ?? ""),
            category: (data.category as TaxFormCategory) ?? "Miscellaneous",
            defaultFrequency:
              (data.defaultFrequency as TaxFrequency) ?? "monthly",
            defaultDeadlineRule:
              (data.defaultDeadlineRule as DeadlineRule) ??
              "lastDayOfMonthAfterPeriod",
            deadlineShift:
              data.deadlineShift == null
                ? null
                : Number(data.deadlineShift),
            isActive: data.isActive !== false,
            seedSource: data.seedSource === true,
            createdAt: (data.createdAt as Timestamp | undefined) ?? null,
            updatedAt: (data.updatedAt as Timestamp | undefined) ?? null,
          };
        });
        qc.setQueryData(TAX_FORMS_QUERY_KEY, rows);
      },
      () => {
        // Snapshots can fail for users without read permission. Leave
        // the cache as-is; the page renders appropriately.
      }
    );
    return unsub;
  }, [qc]);

  return useQuery<TaxFormRow[]>({
    queryKey: TAX_FORMS_QUERY_KEY,
    queryFn: () => [],
  });
}
