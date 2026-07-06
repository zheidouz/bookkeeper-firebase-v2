// Client-side Zod schema for tax-form CRUD.
//
// Shared shape used by Create + Edit dialogs and (conceptually) the
// ImportSeedButton. Keeps the form UI and any future server-side
// validation in sync — duplicate functions/src/zodSchemas.ts when a
// Cloud Function validates the same payload.

import { z } from "zod";

export const TAX_FORM_CATEGORIES = [
  "VAT",
  "Income Tax",
  "Percentage Tax",
  "Withholding",
  "Registration",
  "Miscellaneous",
] as const;

export const TAX_FORM_FREQUENCIES = [
  "monthly",
  "quarterly",
  "semi_annual",
  "annual",
  "custom",
] as const;

export const TAX_FORM_DEADLINE_RULES = [
  "lastDayOfMonthAfterPeriod",
  "lastWorkingDayOfMonthAfterPeriod",
  "lastWorkingDayOfMonthAfterPeriod+1",
  "fixedDayOfMonthAfterPeriod",
] as const;

export const taxFormSchema = z.object({
  formCode: z
    .string()
    .min(1, "Form code is required.")
    .max(20, "Form code must be 20 characters or fewer."),
  formName: z
    .string()
    .min(1, "Form name is required.")
    .max(120, "Form name must be 120 characters or fewer."),
  description: z
    .string()
    .min(1, "Description is required.")
    .max(500, "Description must be 500 characters or fewer."),
  category: z.enum(TAX_FORM_CATEGORIES, {
    errorMap: () => ({ message: "Pick a category." }),
  }),
  defaultFrequency: z.enum(TAX_FORM_FREQUENCIES, {
    errorMap: () => ({ message: "Pick a default frequency." }),
  }),
  defaultDeadlineRule: z.enum(TAX_FORM_DEADLINE_RULES, {
    errorMap: () => ({ message: "Pick a deadline rule." }),
  }),
  deadlineShift: z
    .number()
    .int("Deadline shift must be a whole number.")
    .nullable(),
  isActive: z.boolean().default(true),
});

export type TaxFormInput = z.infer<typeof taxFormSchema>;
