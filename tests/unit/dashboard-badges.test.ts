// Unit tests for the dashboard urgency helper
// (src/features/dashboard/useDashboardCounts.ts → computeTaskUrgency).
//
// The PRD says:
//   - green  → not urgent, >14 days
//   - yellow → ≤14 days
//   - red    → overdue
//   - grey   → archived
//
// `done` rows are always green regardless of deadline (they're done —
// nothing to chase). `archived` rows are always grey.

import { describe, it, expect } from "vitest";

import {
  computeTaskUrgency,
  URGENCY_BG_CLASS,
  URGENCY_LABEL,
} from "@/features/dashboard/dashboardCounts";
import { FIXED_NOW } from "@/features/dashboard/Dashboard.test-data";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW_MS = FIXED_NOW.getTime();

describe("computeTaskUrgency", () => {
  it("returns 'archived' for status=archived", () => {
    expect(
      computeTaskUrgency(
        "archived",
        new Date(NOW_MS - 30 * DAY_MS),
        FIXED_NOW,
      ),
    ).toBe("archived");
  });

  it("returns 'archived' when the archived flag is true even if status=done", () => {
    expect(
      computeTaskUrgency(
        "done",
        new Date(NOW_MS - 100 * DAY_MS),
        FIXED_NOW,
        true,
      ),
    ).toBe("archived");
  });

  it("returns 'overdue' for a pending task past its deadline", () => {
    expect(
      computeTaskUrgency(
        "pending",
        new Date(NOW_MS - 1 * DAY_MS),
        FIXED_NOW,
      ),
    ).toBe("overdue");
  });

  it("returns 'overdue' for ready_to_file past its deadline", () => {
    expect(
      computeTaskUrgency(
        "ready_to_file",
        new Date(NOW_MS - 1 * DAY_MS),
        FIXED_NOW,
      ),
    ).toBe("overdue");
  });

  it("returns 'normal' for a done task even if past its deadline", () => {
    expect(
      computeTaskUrgency(
        "done",
        new Date(NOW_MS - 60 * DAY_MS),
        FIXED_NOW,
      ),
    ).toBe("normal");
  });

  it("returns 'urgent' (yellow) for a pending task with 10 days remaining", () => {
    expect(
      computeTaskUrgency(
        "pending",
        new Date(NOW_MS + 10 * DAY_MS),
        FIXED_NOW,
      ),
    ).toBe("urgent");
  });

  it("returns 'urgent' (yellow) for a pending task with exactly 14 days remaining", () => {
    expect(
      computeTaskUrgency(
        "pending",
        new Date(NOW_MS + 14 * DAY_MS),
        FIXED_NOW,
      ),
    ).toBe("urgent");
  });

  it("returns 'normal' (green) for a pending task with 15 days remaining", () => {
    expect(
      computeTaskUrgency(
        "pending",
        new Date(NOW_MS + 15 * DAY_MS),
        FIXED_NOW,
      ),
    ).toBe("normal");
  });

  it("returns 'normal' (green) for a pending task with 90 days remaining", () => {
    expect(
      computeTaskUrgency(
        "pending",
        new Date(NOW_MS + 90 * DAY_MS),
        FIXED_NOW,
      ),
    ).toBe("normal");
  });
});

describe("URGENCY_BG_CLASS / URGENCY_LABEL", () => {
  it("exposes a class for each urgency bucket", () => {
    expect(URGENCY_BG_CLASS.overdue).toMatch(/red/);
    expect(URGENCY_BG_CLASS.urgent).toMatch(/amber/);
    expect(URGENCY_BG_CLASS.normal).toMatch(/emerald/);
    expect(URGENCY_BG_CLASS.archived).toMatch(/zinc/);
  });

  it("exposes a label for each urgency bucket", () => {
    expect(URGENCY_LABEL.overdue).toBe("Overdue");
    expect(URGENCY_LABEL.urgent).toBe("Due soon");
    expect(URGENCY_LABEL.normal).toBe("On track");
    expect(URGENCY_LABEL.archived).toBe("Archived");
  });
});