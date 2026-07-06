// Shared Zod schemas for user-management callable payloads.
//
// Both `adminCreateUser` and `assignRole` validate against these. The client
// re-declares equivalent shapes in `src/lib/userSchema.ts` because the client
// tsconfig cannot import from `functions/src/`. Keep both files in sync.

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

// archiveTask callable payload (slice #10). `notes` is an optional
// free-text note stored on the archive → next-period taskStatusHistory
// row (never on the successor task itself).
export const archiveTaskSchema = z.object({
  taskId: z.string().min(1, "Task id is required."),
  notes: z
    .string()
    .max(2000, "Notes must be 2000 characters or fewer.")
    .optional(),
});

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserRoleInput = z.infer<typeof userRoleSchema>;
export type ArchiveTaskInput = z.infer<typeof archiveTaskSchema>;