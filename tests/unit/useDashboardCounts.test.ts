// Unit tests for the pure dashboard aggregator
// (src/features/dashboard/useDashboardCounts.ts).
//
// The aggregator has no Firestore or React dependencies, so we can
// exhaustively cover the 8 cards, the two scopes, the UTC
// month/quarter boundaries, and the empty/all-archived edge cases
// against deterministic fixtures.

import { describe, it, expect } from "vitest";

import {
  computeDashboardCounts,
  isSameUtcMonth,
  isSameUtcQuarter,
  ZERO_COUNTS,
} from "@/features/dashboard/dashboardCounts";
import { FIXED_NOW, task } from "@/features/dashboard/Dashboard.test-data";

// Anchor "now" is 2026-07-15T12:00:00Z (July 2026, Q3 2026).

const BK = "bk-1";
const OTHER_BK = "bk-2";

describe("computeDashboardCounts", () => {
  it("returns all-zero counts for an empty list", () => {
    expect(computeDashboardCounts([], "all", BK, FIXED_NOW)).toEqual(
      ZERO_COUNTS,
    );
  });

  it("counts each non-archived status into its own card", () => {
    const counts = computeDashboardCounts(
      [
        task({ status: "pending", deadlineMs: Date.UTC(2026, 7, 30) }),
        task({ status: "ready_to_file", deadlineMs: Date.UTC(2026, 7, 30) }),
        task({ status: "submitted", deadlineMs: Date.UTC(2026, 7, 30) }),
        task({ status: "done", deadlineMs: Date.UTC(2026, 7, 30) }),
      ],
      "all",
      BK,
      FIXED_NOW,
    );
    expect(counts.pending).toBe(1);
    expect(counts.readyToFile).toBe(1);
    expect(counts.submitted).toBe(1);
    expect(counts.done).toBe(1);
    expect(counts.archived).toBe(0);
  });

  it("'overdue' = status not in [done, archived] AND deadline before now", () => {
    const counts = computeDashboardCounts(
      [
        // Past due, still pending → overdue
        task({ status: "pending", deadlineMs: Date.UTC(2026, 6, 1) }),
        // Past due, status=done → NOT overdue
        task({ status: "done", deadlineMs: Date.UTC(2026, 6, 1) }),
        // Past due, status=archived → NOT overdue
        task({ status: "archived", deadlineMs: Date.UTC(2026, 6, 1) }),
        // Future, status=pending → NOT overdue
        task({ status: "pending", deadlineMs: Date.UTC(2026, 7, 1) }),
      ],
      "all",
      BK,
      FIXED_NOW,
    );
    expect(counts.overdue).toBe(1);
  });

  it("'archived' card counts both status=archived and archived=true", () => {
    const counts = computeDashboardCounts(
      [
        task({ status: "archived", deadlineMs: Date.UTC(2026, 6, 1) }),
        task({
          status: "done",
          deadlineMs: Date.UTC(2026, 6, 1),
          archived: true,
        }),
        task({ status: "pending", deadlineMs: Date.UTC(2026, 7, 30) }),
      ],
      "all",
      BK,
      FIXED_NOW,
    );
    expect(counts.archived).toBe(2);
    // The non-archived row stays on the pending card.
    expect(counts.pending).toBe(1);
  });

  it("'dueThisMonth' = rows whose deadline falls in the same UTC calendar month", () => {
    const counts = computeDashboardCounts(
      [
        task({ status: "pending", deadlineMs: Date.UTC(2026, 6, 1) }), // 2026-07-01
        task({ status: "pending", deadlineMs: Date.UTC(2026, 6, 31) }), // 2026-07-31
        task({ status: "pending", deadlineMs: Date.UTC(2026, 7, 1) }), // 2026-08-01
        task({ status: "pending", deadlineMs: Date.UTC(2026, 5, 30) }), // 2026-06-30
      ],
      "all",
      BK,
      FIXED_NOW, // 2026-07-15
    );
    expect(counts.dueThisMonth).toBe(2);
  });

  it("'dueThisQuarter' = rows whose deadline falls in the same UTC quarter", () => {
    const counts = computeDashboardCounts(
      [
        task({ status: "pending", deadlineMs: Date.UTC(2026, 6, 1) }), // Q3
        task({ status: "pending", deadlineMs: Date.UTC(2026, 8, 30) }), // Q3
        task({ status: "pending", deadlineMs: Date.UTC(2026, 9, 1) }), // Q4
        task({ status: "pending", deadlineMs: Date.UTC(2026, 5, 15) }), // Q2
      ],
      "all",
      BK,
      FIXED_NOW,
    );
    expect(counts.dueThisQuarter).toBe(2);
  });

  it("scope='all' includes every bookkeeper's tasks", () => {
    const counts = computeDashboardCounts(
      [
        task({
          status: "pending",
          deadlineMs: Date.UTC(2026, 7, 30),
          assignedBookkeeperId: BK,
        }),
        task({
          status: "pending",
          deadlineMs: Date.UTC(2026, 7, 30),
          assignedBookkeeperId: OTHER_BK,
        }),
      ],
      "all",
      BK,
      FIXED_NOW,
    );
    expect(counts.pending).toBe(2);
  });

  it("scope='mine' restricts to tasks assigned to the current user", () => {
    const counts = computeDashboardCounts(
      [
        task({
          status: "pending",
          deadlineMs: Date.UTC(2026, 7, 30),
          assignedBookkeeperId: BK,
        }),
        task({
          status: "pending",
          deadlineMs: Date.UTC(2026, 7, 30),
          assignedBookkeeperId: OTHER_BK,
        }),
      ],
      "mine",
      BK,
      FIXED_NOW,
    );
    expect(counts.pending).toBe(1);
  });

  it("all-archived list collapses non-archived cards to zero", () => {
    const counts = computeDashboardCounts(
      [
        task({ status: "archived", deadlineMs: Date.UTC(2026, 6, 1) }),
        task({ status: "archived", deadlineMs: Date.UTC(2026, 5, 1) }),
        task({ status: "archived", deadlineMs: Date.UTC(2026, 4, 1) }),
      ],
      "all",
      BK,
      FIXED_NOW,
    );
    expect(counts.archived).toBe(3);
    expect(counts.pending).toBe(0);
    expect(counts.readyToFile).toBe(0);
    expect(counts.submitted).toBe(0);
    expect(counts.done).toBe(0);
    expect(counts.overdue).toBe(0);
    expect(counts.dueThisMonth).toBe(0);
    expect(counts.dueThisQuarter).toBe(0);
  });

  it("month/quarter boundaries are UTC, not local", () => {
    // 2026-07-01T00:00:00Z is still July (UTC), so it's "this month".
    expect(
      isSameUtcMonth(new Date(Date.UTC(2026, 6, 1, 0, 0, 1)), FIXED_NOW),
    ).toBe(true);
    // 2026-07-31T23:59:59Z is the last second of July UTC.
    expect(
      isSameUtcMonth(new Date(Date.UTC(2026, 6, 31, 23, 59, 59)), FIXED_NOW),
    ).toBe(true);
    // 2026-08-01T00:00:00Z is the first second of August UTC → no.
    expect(
      isSameUtcMonth(new Date(Date.UTC(2026, 7, 1, 0, 0, 1)), FIXED_NOW),
    ).toBe(false);
    // Q3 spans Jul–Sep UTC. Sep 30 is still Q3.
    expect(
      isSameUtcQuarter(new Date(Date.UTC(2026, 8, 30, 23, 59, 59)), FIXED_NOW),
    ).toBe(true);
    // Oct 1 starts Q4.
    expect(
      isSameUtcQuarter(new Date(Date.UTC(2026, 9, 1, 0, 0, 1)), FIXED_NOW),
    ).toBe(false);
  });
});