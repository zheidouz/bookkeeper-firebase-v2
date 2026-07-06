// functions/src/seedBirHolidays.ts
//
// Cloud Function: seedBirHolidays
//
// Callable, admin-only. Reads the curated list at birHolidaysData.ts
// and writes one document per year to `config/birHolidays/{year}` using
// `merge: true` so re-runs are idempotent.
//
// Returns `{ count: number, years: string[] }`.
//
// Slice #4. Does NOT touch rules — the `config/` collection has no
// client-facing rules, and admin SDK writes are unconditional.

import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { birHolidays } from "./birHolidaysData.js";

if (!getApps().length) {
  initializeApp();
}

interface SeedBirHolidaysResponse {
  count: number;
  years: string[];
}

interface SeedBirHolidaysInput {
  /** Optional: only seed these years. Defaults to all curated years. */
  years?: string[];
}

export const seedBirHolidays = onCall(
  { region: "asia-southeast1" },
  async (
    request: CallableRequest<SeedBirHolidaysInput | undefined>,
  ): Promise<SeedBirHolidaysResponse> => {
    if (request.auth?.token.role !== "admin") {
      throw new HttpsError(
        "permission-denied",
        "Only admins can seed BIR holidays.",
      );
    }

    const requested = request.data?.years;
    const entries =
      Array.isArray(requested) && requested.length > 0
        ? birHolidays.filter((b) => requested.includes(b.year))
        : birHolidays;

    if (entries.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "No matching years in curated birHolidays dataset.",
      );
    }

    const db = getFirestore();
    let count = 0;
    const years: string[] = [];

    // Path shape: top-level `birHolidays` collection, one doc per year.
    // (The issue brief wrote this as "config/birHolidays/{year}" but
    // Firestore requires document paths to have an even number of
    // components — collection/doc/subcollection/doc etc. — and
    // `config/birHolidays/2026` would parse as collection/doc/subcol,
    // which is not a document reference. We promote `birHolidays` to a
    // top-level collection so the year IS the document ID and the path
    // is a valid 2-component doc ref.)
    for (const entry of entries) {
      const ref = db.doc(`birHolidays/${entry.year}`);
      await ref.set(
        {
          year: entry.year,
          days: entry.days,
          source: entry.source,
          seededAt: new Date().toISOString(),
          seededBy: request.auth?.uid ?? null,
        },
        { merge: true },
      );
      count += entry.days.length;
      years.push(entry.year);
    }

    return { count, years };
  },
);