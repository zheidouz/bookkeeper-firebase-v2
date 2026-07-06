// Client-side Zod schemas for the user-management forms.
//
// Mirrors `functions/src/zodSchemas.ts` — keep the two in sync. We can't
// import directly from `functions/src/` because the client tsconfig
// (and bundler) can't reach into the functions workspace.

import { z } from "zod";

export const ROLES = ["admin", "bookkeeper", "staff"] as const;
export type RoleZ = (typeof ROLES)[number];

export const userCreateSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  displayName: z
    .string()
    .min(1, "Display name is required.")
    .max(80, "Display name must be 80 characters or fewer."),
  role: z.enum(ROLES, {
    errorMap: () => ({ message: "Pick a role." }),
  }),
});

export const userRoleSchema = z.object({
  uid: z.string().min(1, "User id is required."),
  role: z.enum(ROLES, {
    errorMap: () => ({ message: "Pick a role." }),
  }),
});

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserRoleInput = z.infer<typeof userRoleSchema>;