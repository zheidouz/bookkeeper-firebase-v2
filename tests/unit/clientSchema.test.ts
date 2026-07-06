// Unit tests for the client-side client Zod schema (slice #7).

import { describe, it, expect } from "vitest";

import {
  clientSchema,
  type ClientInput,
} from "@/features/clients/clientSchema";

const valid: ClientInput = {
  businessName: "Acme Trading Co.",
  ownerName: "Jane Doe",
  tin: "123-456-789",
  rdo: "047",
  address: "123 Main St, Quezon City",
  contactNumber: "+63 917 123 4567",
  email: "contact@acme.example",
  assignedBookkeeperId: "uid-bookkeeper-1",
  status: "active",
  notes: "VIP client",
};

describe("clientSchema", () => {
  it("accepts a valid payload", () => {
    const result = clientSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.businessName).toBe("Acme Trading Co.");
      expect(result.data.tin).toBe("123-456-789");
    }
  });

  it("applies the status default of 'active' when not supplied", () => {
    const { status: _omit, ...rest } = valid;
    void _omit;
    const result = clientSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("active");
    }
  });

  it("applies the notes default of '' when not supplied", () => {
    const { notes: _omit, ...rest } = valid;
    void _omit;
    const result = clientSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBe("");
    }
  });

  it("accepts the 12-digit TIN format", () => {
    const result = clientSchema.safeParse({ ...valid, tin: "123-456-789-000" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing businessName", () => {
    const result = clientSchema.safeParse({ ...valid, businessName: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("businessName");
    }
  });

  it("rejects a malformed TIN", () => {
    const result = clientSchema.safeParse({ ...valid, tin: "12-345-6789" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("tin");
    }
  });

  it("rejects an invalid email", () => {
    const result = clientSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("email");
    }
  });

  it("rejects a missing assignedBookkeeperId", () => {
    const result = clientSchema.safeParse({
      ...valid,
      assignedBookkeeperId: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("assignedBookkeeperId");
    }
  });

  it("rejects an invalid status enum value", () => {
    const result = clientSchema.safeParse({
      ...valid,
      status: "deleted" as unknown as ClientInput["status"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a contactNumber that's too short", () => {
    const result = clientSchema.safeParse({
      ...valid,
      contactNumber: "12345",
    });
    expect(result.success).toBe(false);
  });

  it("rejects notes longer than 2000 chars", () => {
    const result = clientSchema.safeParse({
      ...valid,
      notes: "a".repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});
