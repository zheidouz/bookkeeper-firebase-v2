// Unit tests for the clientFormTaskInputSchema (slice #8). Validates
// that the RHF/Zod schema accepts the canonical happy path and
// rejects the obvious empty/invalid inputs that the dialogs guard
// against.

import { describe, expect, it } from "vitest";

import {
  clientFormTaskInputSchema,
  TASK_FREQUENCIES,
  TASK_STATUSES,
} from "@/features/clientFormTasks/clientFormTaskSchema";

function validInput() {
  return {
    clientId: "client-abc",
    taxFormId: "form-2550Q",
    assignedBookkeeperId: "user-bk",
    frequency: "quarterly" as const,
    periodStart: new Date("2026-01-01T00:00:00Z"),
    periodEnd: new Date("2026-03-31T00:00:00Z"),
    deadlineDate: new Date("2026-04-25T00:00:00Z"),
    status: "pending" as const,
    archived: false,
    notes: "Q1 VAT",
  };
}

describe("clientFormTaskInputSchema — happy path", () => {
  it("accepts a fully-populated input", () => {
    const parsed = clientFormTaskInputSchema.parse(validInput());
    expect(parsed.taxFormId).toBe("form-2550Q");
    expect(parsed.frequency).toBe("quarterly");
    expect(parsed.status).toBe("pending");
    expect(parsed.archived).toBe(false);
    expect(parsed.notes).toBe("Q1 VAT");
  });

  it("coerces yyyy-mm-dd strings to Date for date fields", () => {
    const result = clientFormTaskInputSchema.parse({
      ...validInput(),
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      deadlineDate: "2026-04-25",
    });
    expect(result.periodStart).toBeInstanceOf(Date);
    expect(result.periodEnd).toBeInstanceOf(Date);
    expect(result.deadlineDate).toBeInstanceOf(Date);
  });

  it("defaults status to 'pending' and archived to false when omitted", () => {
    const input = validInput();
    const {
      status: _s,
      archived: _a,
      notes: _n,
      ...rest
    } = input;
    const result = clientFormTaskInputSchema.parse(rest);
    expect(result.status).toBe("pending");
    expect(result.archived).toBe(false);
    expect(result.notes).toBe(""); // default
  });
});

describe("clientFormTaskInputSchema — failure cases", () => {
  it("rejects empty clientId", () => {
    const r = clientFormTaskInputSchema.safeParse({
      ...validInput(),
      clientId: "",
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty taxFormId", () => {
    const r = clientFormTaskInputSchema.safeParse({
      ...validInput(),
      taxFormId: "",
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty assignedBookkeeperId", () => {
    const r = clientFormTaskInputSchema.safeParse({
      ...validInput(),
      assignedBookkeeperId: "",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown frequency", () => {
    const r = clientFormTaskInputSchema.safeParse({
      ...validInput(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      frequency: "biweekly" as any,
    });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown status", () => {
    const r = clientFormTaskInputSchema.safeParse({
      ...validInput(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      status: "unknown" as any,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a notes string longer than 2000 chars", () => {
    const r = clientFormTaskInputSchema.safeParse({
      ...validInput(),
      notes: "x".repeat(2001),
    });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid date string", () => {
    const r = clientFormTaskInputSchema.safeParse({
      ...validInput(),
      deadlineDate: "not-a-date",
    });
    expect(r.success).toBe(false);
  });
});

describe("clientFormTaskInputSchema — enum surface", () => {
  it("TASK_STATUSES lists the PRD status enum", () => {
    expect(TASK_STATUSES).toEqual([
      "pending",
      "ready_to_file",
      "submitted",
      "done",
      "archived",
    ]);
  });

  it("TASK_FREQUENCIES lists the PRD frequency enum", () => {
    expect(TASK_FREQUENCIES).toEqual([
      "monthly",
      "quarterly",
      "semi_annual",
      "annual",
      "custom",
    ]);
  });
});
