// functions/src/supportReindexStats.ts
//
// Slice #17: stub for the `support_reindex_stats` callable (per
// ADR-003 / docs/issues/0016-rules-hardening.md).
//
// Intended purpose: re-issue the Firestore composite-index rebuild
// for the views that back the dashboard / task-table / archive-page
// — anything that reads `clientFormTasks` with a composite filter
// (`archived=false`, `status in (...)`, ordered by `deadlineAt`).
// This is the kind of operation an admin runs after seeding a new
// tax-form year, after a bulk archive, or after a rules change.
//
// For now this is a STUB that returns `{ ok: true, scope: "stub" }`.
// The real implementation will (a) read the `birHolidays/{year}`
// docs touched since `since`, (b) enumerate every `clientFormTasks`
// doc in those windows, and (c) issue a `FieldValue.serverTimestamp()`
// bump on `updatedAt` to force the existing composite index to
// admit the row.
//
// Auth: admin-only.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  initializeApp,
  getApps,
} from "firebase-admin/app";
import { supportReindexStatsSchema } from "./zodSchemas.js";

if (getApps().length === 0) {
  initializeApp();
}

/**
 * Admin-only callable that returns a reindex scope summary.
 *
 * Stub behavior: it accepts the validated payload and returns
 * `{ ok: true, scope: "stub", years, since }`. The real
 * implementation will collect the affected task-id set and return
 * `{ ok: true, scope: "reindexing", matched, queued, tookMs }`.
 */
export const supportReindexStats = onCall(
  { region: "asia-southeast1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to reindex.");
    }
    if ((request.auth.token as { role?: string }).role !== "admin") {
      throw new HttpsError(
        "permission-denied",
        "Only admins can run the reindex support callable.",
      );
    }

    const parsed = supportReindexStatsSchema.safeParse(request.data ?? {});
    if (!parsed.success) {
      throw new HttpsError(
        "invalid-argument",
        "`years` must be an array of 4-digit integers; `since` must be ISO-8601.",
      );
    }

    return {
      ok: true as const,
      scope: "stub" as const,
      years: parsed.data.years ?? null,
      since: parsed.data.since ?? null,
      calledBy: request.auth.uid,
      calledAt: new Date().toISOString(),
    };
  },
);
