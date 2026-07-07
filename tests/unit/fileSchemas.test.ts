/**
 * Unit tests for the slice #16 file-storage Zod schemas
 * (functions/src/zodSchemas.ts):
 *
 *   - getFileUrlSchema  →  { taskId, fileId }
 *   - deleteFileSchema  →  { taskId, fileId }
 *
 * Mirrors `archiveTaskSchema.test.ts` style: each schema is exercised
 * across the valid case + every failure mode the callable should
 * reject with `invalid-argument` HttpsError.
 */
import { describe, it, expect } from "vitest";
import {
  getFileUrlSchema,
  deleteFileSchema,
} from "../../functions/src/zodSchemas";

describe("getFileUrlSchema", () => {
  it("accepts a valid payload", () => {
    const result = getFileUrlSchema.safeParse({
      taskId: "task_abc123",
      fileId: "file_xyz789",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.taskId).toBe("task_abc123");
      expect(result.data.fileId).toBe("file_xyz789");
    }
  });

  it("rejects an empty taskId", () => {
    const result = getFileUrlSchema.safeParse({
      taskId: "",
      fileId: "file_xyz",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty fileId", () => {
    const result = getFileUrlSchema.safeParse({
      taskId: "task_abc",
      fileId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing taskId", () => {
    const result = getFileUrlSchema.safeParse({
      fileId: "file_xyz",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing fileId", () => {
    const result = getFileUrlSchema.safeParse({
      taskId: "task_abc",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty payload", () => {
    const result = getFileUrlSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("deleteFileSchema", () => {
  it("accepts a valid payload", () => {
    const result = deleteFileSchema.safeParse({
      taskId: "task_abc123",
      fileId: "file_xyz789",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.taskId).toBe("task_abc123");
      expect(result.data.fileId).toBe("file_xyz789");
    }
  });

  it("rejects an empty taskId", () => {
    const result = deleteFileSchema.safeParse({
      taskId: "",
      fileId: "file_xyz",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty fileId", () => {
    const result = deleteFileSchema.safeParse({
      taskId: "task_abc",
      fileId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing taskId", () => {
    const result = deleteFileSchema.safeParse({
      fileId: "file_xyz",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing fileId", () => {
    const result = deleteFileSchema.safeParse({
      taskId: "task_abc",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty payload", () => {
    const result = deleteFileSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
