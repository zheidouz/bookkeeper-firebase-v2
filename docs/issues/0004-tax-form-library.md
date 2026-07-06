## Parent

Bookkeeper & Tax Filing Dashboard v1 — https://github.com/zheidouz/bookkeeper-firebase-v2/issues/1

## What to build

The Tax Form Library: the master list of BIR forms, the seed-data import button, and the CRUD UI for custom forms. After this slice, the firm has a populated, editable reference library that later slices can attach to clients.

Specifically:

- Schema for `taxForms/{formId}` exactly as specified in the PRD: `{formCode, formName, description, category, defaultFrequency, defaultDeadlineRule, deadlineShift?, isActive, createdAt, updatedAt}`.
- Hardcoded seed at `src/seed/birForms.json` containing the 18 forms named in the PRD: 1601C, 0619E, 0619F, 1601EQ, 1601FQ, 2550M, 2550Q, 1701Q, 1701A, 1702Q, 1702RT, 1702EX, 1702MX, 2307, 2316, 0605, 2000, 2000-OT. Each with sensible `defaultFrequency` and `defaultDeadlineRule` values (e.g., 2550Q → quarterly + `lastWorkingDayOfMonthAfterPeriod+1`).
- UI: `/tax-forms` page with a searchable, paginated Table (shadcn `Table`) of all forms. Filters: `category`, `isActive`. Per-row actions: Edit, Disable/Enable. Bookkeeper permission to create custom forms is enabled here, but the "Import/refresh seed" button is admin-only.
- "Create form" Dialog (RHF + Zod, sharing the schema with the Cloud Function for create-if-missing) and "Edit form" Dialog (same fields, `isActive` toggle surfaced as well).
- "Import/refresh seed" button (admin-only): reads `src/seed/birForms.json` and upserts by `formCode` — does not clobber forms that already exist with the same `formCode` but a manually-edited `description` or `deadlineShift` (compare on `formCode` only, never overwrite non-default fields if the existing doc has been edited post-creation; track via a `seedSource` flag on imported rows).
- `firestore.rules`: all authenticated roles can read `taxForms`; bookkeeper+admin can create and update; only admin can delete.

## Acceptance criteria

- [ ] `/tax-forms` lists all 18 seeded forms after a fresh `Import/refresh seed` click.
- [ ] Re-running `Import/refresh seed` does not duplicate or clobber user-edited rows.
- [ ] Admin can create a custom form (e.g., "9999-TEST") via the Dialog; it appears in the list and is selectable for attach in later slices.
- [ ] Disabling a form removes it from active selectors but keeps it visible (greyed out) in the table with `isActive: false`.
- [ ] Non-admin attempting `taxForms.create()` directly is denied.
- [ ] Search filters the table by `formCode` or `formName` (case-insensitive).
- [ ] Vitest covers the seed-merge logic (no-clobber on user edits). Emulator tests cover the rules and the Cloud Function.

## Blocked by

- Auth shell (#3)
