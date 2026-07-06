## Parent

Bookkeeper & Tax Filing Dashboard v1 — https://github.com/zheidouz/bookkeeper-firebase-v2/issues/1

## What to build

The "attach form to client" workflow: from `/clients/{clientId}`, a bookkeeper picks a form, sets the period and deadline, and the system creates the first `clientFormTasks` document in `pending` status. After this slice, a client has at least one tracked obligation.

Specifically:

- Schema for `clientFormTasks/{taskId}` exactly as in the PRD: `{clientId, taxFormId, assignedBookkeeperId, frequency, periodStart, periodEnd, deadlineDate, status, archived, archivedAt?, archivedBy?, previousTaskId?, nextTaskId?, notes, createdAt, updatedAt}`. `status` enum: `'pending' | 'ready_to_file' | 'submitted' | 'done' | 'archived'`. `frequency` enum: `'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'custom'`.
- UI: "Attach form" button on `/clients/{clientId}` opens a Dialog with `form` (Select from `taxForms`), `frequency` (Select, defaults to form's `defaultFrequency`), `periodStart` / `periodEnd` (date pickers), `deadlineDate` (date picker, defaults to the form's computed default; bookkeeper can override), `assignedBookkeeperId` (Select, defaults to client's assigned bookkeeper), `notes`. On submit, writes the task doc with `status: 'pending'`, `archived: false`, and the derived `year` / `monthOrQuarter`.
- The "Attached forms" section on `/clients/{clientId}` switches from empty-state to a list of `clientFormTasks` filtered to `archived == false` (#15 handles archived).
- Edit/Remove action available while `status == 'pending'` (per PRD story 29). Bookkeeper can only edit/remove their own pending tasks; admin can edit/remove any pending task.
- `firestore.rules`: bookkeeper+admin can create; bookkeeper can update their assigned tasks; admin can update any; non-archived, non-pending deletes restricted to admin.
- Cloud Function not required — pure SDK-direct write is sufficient here (the rule layer enforces RBAC).

## Acceptance criteria

- [ ] Attaching a 2550Q form to a client with default values produces a task with `status: 'pending'`, correct `periodStart/End` for Q1 of the current year, and a deadline matching the form's algorithmic rule (#8 supplies the function; this slice just calls it).
- [ ] The new task appears in the client's "Attached forms" section.
- [ ] Editing the `deadlineDate` on a pending task updates the doc.
- [ ] A bookkeeper attempting to edit another bookkeeper's pending task is denied by rules.
- [ ] Removing a pending task removes it from the list.
- [ ] Vitest covers the derived `year`/`monthOrQuarter` computation. Emulator tests cover the rules.

## Blocked by

- Tax form library + seed import (#6)
- Client CRUD + list/search (#7)
