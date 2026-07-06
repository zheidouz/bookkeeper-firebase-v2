// Unit tests for the statusReducer (slice #9). Locks the legal
// next-status mapping for the workflow:
//
//   pending      → ready_to_file
//   ready_to_file → submitted
//   submitted    → done
//   done         → (terminal, no next)
//   archived     → (terminal, no next)
//
// plus the matching `isLegalTransition` predicate, the wider matrix
// of illegal jumps that the Firestore rules must reject, and the
// human-readable label dictionary used by the StatusActions buttons.

import { describe, expect, it } from "vitest";

import {
  getLegalNextStatuses,
  isLegalTransition,
  STATUS_LABELS_LONG,
} from "@/features/clientFormTasks/statusReducer";
import type { TaskStatus } from "@/features/clientFormTasks/clientFormTaskSchema";

describe("statusReducer — getLegalNextStatuses", () => {
  it("pending → ready_to_file", () => {
    expect(getLegalNextStatuses("pending")).toEqual(["ready_to_file"]);
  });

  it("ready_to_file → submitted", () => {
    expect(getLegalNextStatuses("ready_to_file")).toEqual(["submitted"]);
  });

  it("submitted → done", () => {
    expect(getLegalNextStatuses("submitted")).toEqual(["done"]);
  });

  it("done → no further transitions (Archive is slice #10's job)", () => {
    expect(getLegalNextStatuses("done")).toEqual([]);
  });

  it("archived → no further transitions (terminal)", () => {
    expect(getLegalNextStatuses("archived")).toEqual([]);
  });
});

describe("statusReducer — isLegalTransition", () => {
  const legal: Array<[TaskStatus, TaskStatus]> = [
    ["pending", "ready_to_file"],
    ["ready_to_file", "submitted"],
    ["submitted", "done"],
  ];

  for (const [from, to] of legal) {
    it(`accepts ${from} → ${to}`, () => {
      expect(isLegalTransition(from, to)).toBe(true);
    });
  }

  const illegal: Array<[TaskStatus, TaskStatus]> = [
    ["pending", "submitted"],
    ["pending", "done"],
    ["pending", "archived"],
    ["ready_to_file", "done"],
    ["ready_to_file", "pending"],
    ["ready_to_file", "archived"],
    ["submitted", "pending"],
    ["submitted", "ready_to_file"],
    ["submitted", "archived"],
    ["done", "pending"],
    ["done", "ready_to_file"],
    ["done", "submitted"],
    ["done", "archived"],
    ["archived", "pending"],
    ["archived", "ready_to_file"],
    ["archived", "submitted"],
    ["archived", "done"],
  ];

  for (const [from, to] of illegal) {
    it(`rejects ${from} → ${to}`, () => {
      expect(isLegalTransition(from, to)).toBe(false);
    });
  }

  it("rejects self-loops", () => {
    for (const s of [
      "pending",
      "ready_to_file",
      "submitted",
      "done",
      "archived",
    ] as TaskStatus[]) {
      expect(isLegalTransition(s, s)).toBe(false);
    }
  });
});

describe("statusReducer — STATUS_LABELS_LONG", () => {
  it("labels every status", () => {
    expect(STATUS_LABELS_LONG.pending).toBe("Pending");
    expect(STATUS_LABELS_LONG.ready_to_file).toBe("Ready to file");
    expect(STATUS_LABELS_LONG.submitted).toBe("Submitted");
    expect(STATUS_LABELS_LONG.done).toBe("Done");
    expect(STATUS_LABELS_LONG.archived).toBe("Archived");
  });
});
