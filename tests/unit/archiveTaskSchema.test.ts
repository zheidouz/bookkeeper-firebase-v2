/**
 * Unit tests for the archiveTask Zod schema (functions/src/zodSchemas.ts).
 *
 * Covers the valid case + every failure mode the callable should reject
 * with `invalid-argument` HttpsError. Mirrors the slice #5
 * `archiveTaskSchema` import shape so the same schema validates input
 * on the client (if needed) and the server.
 */
import { describe, it, expect } from "vitest";
import { archiveTaskSchema } from "../../functions/src/zodSchemas";

describe("archiveTaskSchema", () => {
  it("accepts a valid payload", () => {
    const result = archiveTaskSchema.safeParse({
      taskId: "task_abc123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.taskId).toBe("task_abc123");
      expect(result.data.notes).toBeUndefined();
    }
  });

  it("accepts a valid payload with notes", () => {
    const result = archiveTaskSchema.safeParse({
      taskId: "task_xyz",
      notes: "Filed and acknowledged.",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBe("Filed and acknowledged.");
    }
  });

  it("rejects an empty taskId", () => {
    const result = archiveTaskSchema.safeParse({ taskId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing taskId", () => {
    const result = archiveTaskSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects a notes string longer than 2000 chars", () => {
    const result = archiveTaskSchema.safeParse({
      taskId: "task_abc",
      notes: "x".repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});
