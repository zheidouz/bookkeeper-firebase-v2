// ImportSeedButton — admin-only "Import/refresh seed" button.
//
// Flow:
//   1. Read the hardcoded seed at src/seed/birForms.json (static import).
//   2. Project the currently-cached taxForms rows down to the merge fn's shape.
//   3. Call mergeSeedForms() (pure) to get a list of insert/update/skip actions.
//   4. Perform each insert/update via a direct Firestore SDK write
//      (setDoc({ merge: true }) so update existing is safe, set otherwise).
//   5. Fire a window.alert() summary (no toast hook available in slice #2).
//
// Firestore's `writeBatch` would let us commit all in one round-trip, but
// we keep it simple with sequential setDocs — the operation is admin-only
// and fires at most ~18 writes per click.

import { useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { Database, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

import { db } from "@/lib/firebaseConfig";
import {
  mergeSeedForms,
  summarizeMerge,
  type TaxFormSeed,
} from "@/lib/mergeSeedForms";
import {
  asExistingTaxForms,
  useTaxForms,
} from "@/features/taxForms/useTaxForms";

import birFormsSeed from "@/seed/birForms.json";

interface ImportSeedButtonProps {
  /**
   * After the write phase completes, fired with the new "now" timestamp
   * so the dialog / page can call mergeSeedForms with the same value
   * for deterministic testing if needed.
   */
  onImported?: (summary: {
    inserted: number;
    updated: number;
    skipped: number;
    skippedCodes: string[];
  }) => void;
}

export default function ImportSeedButton({ onImported }: ImportSeedButtonProps) {
  const { data: existing } = useTaxForms();
  const [busy, setBusy] = useState(false);

  async function handleImport() {
    if (busy) return;
    setBusy(true);
    try {
      const seeds = birFormsSeed as unknown as TaxFormSeed[];
      const existingRows = asExistingTaxForms(existing);
      const now = Date.now();

      const results = mergeSeedForms(seeds, existingRows, now);

      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      const skippedCodes: string[] = [];

      for (const r of results) {
        if (r.action === "insert") {
          // setDoc (overwrite) so re-running the import doesn't keep an
          // outdated version of an inserted row.
          await setDoc(doc(db, "taxForms", r.formCode), {
            ...(r.merged as Record<string, unknown>),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          inserted++;
        } else if (r.action === "update") {
          // Same as insert body — for an "update" that matches the seed
          // verbatim we just refresh updatedAt while preserving createdAt.
          const createdAt = r.merged.createdAt;
          await setDoc(
            doc(db, "taxForms", r.formCode),
            {
              ...(r.merged as Record<string, unknown>),
              createdAt:
                typeof createdAt === "number" ? createdAt : serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
          updated++;
        } else {
          skipped++;
          if (r.formCode) skippedCodes.push(r.formCode);
        }
      }

      const summary = { inserted, updated, skipped, skippedCodes };

      // No toast hook in slice #2 — use a lightweight window.alert so the
      // admin gets immediate feedback without taking a slice-#2 dependency.
      if (typeof window !== "undefined") {
        const msg = `Imported ${inserted} forms, updated ${updated}, skipped ${skipped}${
          skipped > 0 ? ` (${skippedCodes.join(", ")})` : ""
        }.`;
        // eslint-disable-next-line no-alert
        window.alert(msg);
      }

      if (onImported) onImported(summary);
      void summarizeMerge(results); // touched for tree-shaking guard / smoke
    } catch (err) {
      if (typeof window !== "undefined") {
        const msg =
          err && typeof err === "object" && "message" in err
            ? String((err as { message: unknown }).message)
            : "Seed import failed.";
        // eslint-disable-next-line no-alert
        window.alert(`Seed import failed: ${msg}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      onClick={handleImport}
      disabled={busy}
      variant="outline"
      data-testid="import-seed-button"
    >
      <RefreshCw
        className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`}
        aria-hidden
      />
      {busy ? "Importing…" : "Import/refresh seed"}
      <Database className="ml-2 h-4 w-4 opacity-50" aria-hidden />
    </Button>
  );
}
