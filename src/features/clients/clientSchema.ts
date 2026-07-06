// Client-side Zod schema for client CRUD (slice #7).
//
// 11 fields per PRD:
//   businessName, ownerName, tin, rdo, address, contactNumber, email,
//   assignedBookkeeperId, status, notes
// (createdAt + updatedAt are serverTimestamp'd in the dialog handlers,
// so they don't live in this input schema.)
//
// Mirrors the conceptual server-side schema in
// `functions/src/zodSchemas.ts` — keep the two in sync when slice #8
// starts calling validateClient from Cloud Functions.

import { z } from "zod";

export const CLIENT_STATUSES = ["active", "inactive", "archived"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

// TIN formats accepted by the BIR: 9-digit "123-456-789" or
// 12-digit branch "123-456-789-000". Both are common in PH bookkeeping
// work — bookkeepers type one or the other depending on whether the
// client has multiple branches.
export const TIN_REGEX = /^\d{3}-\d{3}-\d{3}(-\d{3})?$/;

export const clientSchema = z.object({
  businessName: z
    .string()
    .min(1, "Business name is required.")
    .max(120, "Business name must be 120 characters or fewer."),
  ownerName: z
    .string()
    .min(1, "Owner name is required.")
    .max(120, "Owner name must be 120 characters or fewer."),
  tin: z
    .string()
    .regex(
      TIN_REGEX,
      "TIN must be like 123-456-789 or 123-456-789-000",
    ),
  rdo: z
    .string()
    .min(2, "RDO code is required (e.g. 047).")
    .max(10, "RDO code must be 10 characters or fewer."),
  address: z
    .string()
    .min(1, "Address is required.")
    .max(300, "Address must be 300 characters or fewer."),
  contactNumber: z
    .string()
    .min(7, "Contact number is required.")
    .max(20, "Contact number must be 20 characters or fewer."),
  email: z.string().email("Enter a valid email address."),
  // Bookkeeper UID — populated from the bookkeepers Select. We don't
  // reference the users doc by import to keep this schema reusable in
  // a server context where the user table might be inaccessible.
  assignedBookkeeperId: z
    .string()
    .min(1, "Pick an assigned bookkeeper."),
  status: z
    .enum(CLIENT_STATUSES, {
      errorMap: () => ({ message: "Pick a status." }),
    })
    .default("active"),
  notes: z
    .string()
    .max(2000, "Notes must be 2000 characters or fewer.")
    .optional()
    .default(""),
});

export type ClientInput = z.infer<typeof clientSchema>;
