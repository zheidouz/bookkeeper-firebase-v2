// Unit tests for the client-side user-management Zod schemas.
// Mirrors functions/src/zodSchemas.ts — keep both in sync.

import { describe, it, expect } from "vitest";

import {
  userCreateSchema,
  userRoleSchema,
  type UserCreateInput,
} from "@/lib/userSchema";

describe("userCreateSchema", () => {
  const valid: UserCreateInput = {
    email: "tester@example.com",
    displayName: "Test User",
    role: "bookkeeper",
  };

  it("accepts a valid payload", () => {
    const result = userCreateSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects a missing email", () => {
    const result = userCreateSchema.safeParse({ ...valid, email: undefined });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("email");
    }
  });

  it("rejects a malformed email", () => {
    const result = userCreateSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("email");
    }
  });

  it("rejects an empty displayName", () => {
    const result = userCreateSchema.safeParse({ ...valid, displayName: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("displayName");
    }
  });

  it("rejects a missing role", () => {
    const { role: _omit, ...withoutRole } = valid;
    void _omit;
    const result = userCreateSchema.safeParse(withoutRole);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("role");
    }
  });

  it("rejects an invalid role value", () => {
    const result = userCreateSchema.safeParse({ ...valid, role: "owner" });
    expect(result.success).toBe(false);
  });

  it("rejects a displayName longer than 80 chars", () => {
    const result = userCreateSchema.safeParse({
      ...valid,
      displayName: "a".repeat(81),
    });
    expect(result.success).toBe(false);
  });
});

describe("userRoleSchema", () => {
  it("accepts a valid payload", () => {
    const result = userRoleSchema.safeParse({
      uid: "abc123",
      role: "admin",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty uid", () => {
    const result = userRoleSchema.safeParse({ uid: "", role: "staff" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid role value", () => {
    const result = userRoleSchema.safeParse({ uid: "abc", role: "owner" });
    expect(result.success).toBe(false);
  });
});