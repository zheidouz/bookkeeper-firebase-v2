// Zod schema for the clientFormTasks collection (slice #8 —
// attach-form-to-client). Mirrors the PRD shape.
//
// Archive-related fields (archivedAt, archivedBy, previousTaskId,
// nextTaskId) live on the doc but are managed by the slice #10 archive
// callable — they are NOT user-editable from the Attach / Edit dialogs,
// so they are not in this input schema.

import { z } from "zod";

export const TASK_STATUSES = [
  "pending",
  "ready_to_file",
  "submitted",
  "done",
  "archived",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_FREQUENCIES = [
  "monthly",
  "quarterly",
  "semi_annual",
  "annual",
  "custom",
] as const;
export type TaskFrequency = (typeof TASK_FREQUENCIES)[number];

export const taskStatusSchema = z.enum(TASK_STATUSES, {
  errorMap: () => ({ message: "Pick a valid task status." }),
});

export const taskFrequencySchema = z.enum(TASK_FREQUENCIES, {
  errorMap: () => ({ message: "Pick a valid filing frequency." }),
});

// RHF binds the form to <input type="date"> which gives yyyy-mm-dd
// strings; we coerce to Date on submit so the schema and the derived
// helpers share a single canonical type.
const dateField = z
  .union([z.string(), z.date()])
  .transform((v) => (v instanceof Date ? v : new Date(v)))
  .refine((d) => !Number.isNaN(d.getTime()), {
    message: "Enter a valid date.",
  });

export const clientFormTaskInputSchema = z.object({
  clientId: z.string().min(1, "Client is required."),
  taxFormId: z.string().min(1, "Tax form is required."),
  assignedBookkeeperId: z
    .string()
    .min(1, "Pick an assigned bookkeeper."),
  frequency: taskFrequencySchema,
  periodStart: dateField,
  periodEnd: dateField,
  deadlineDate: dateField,
  status: taskStatusSchema.default("pending"),
  archived: z.boolean().default(false),
  notes: z
    .string()
    .max(2000, "Notes must be 2000 characters or fewer.")
    .optional()
    .default(""),
});

export type ClientFormTaskInput = z.infer<typeof clientFormTaskInputSchema>;
