## Parent

Bookkeeper & Tax Filing Dashboard v1 — https://github.com/zheidouz/bookkeeper-firebase-v2/issues/1

## What to build

The status workflow: a task moves `pending → ready_to_file → submitted → done`, and every transition is appended to `taskStatusHistory` with `oldStatus`, `newStatus`, `changedBy`, `changedAt`, and optional `notes`. After this slice, the row in the client's "Attached forms" list has working status-change buttons and the modal opens to a real status history.

Specifically:

- Schema for `taskStatusHistory/{historyId}` exactly as in the PRD: `{taskId, oldStatus, newStatus, changedBy, changedAt, notes}`. Index: `(taskId asc, changedAt desc)`.
- Status change actions in the UI: a `<StatusActions task={…} />` component that renders only the legal-next-status buttons based on current status. Plus a "Change status with note" Dialog for transitions the user wants to annotate.
- Per-row dropdown in the client's "Attached forms" list with the legal transitions.
- `firestore.rules`: status field can be written to the legal next status only (rules enforce `request.resource.data.status` is exactly one step forward in the enum, or to `archived` from `done` per #10). Bookkeeper writes restricted to assigned tasks; admin can change any task's status.
- Every status write appends to `taskStatusHistory/{auto-id}` in the same batched write (no Cloud Function needed; the client's SDK direct write does both writes in one batch).
- Rules also reject the illegal jump `pending → done` (test case for #17).

## Acceptance criteria

- [ ] Moving a task `pending → ready_to_file` appends one row to `taskStatusHistory` with correct `oldStatus`/`newStatus`/`changedBy`/`changedAt`.
- [ ] Attempting to jump `pending → done` directly is rejected by rules (verified in emulator tests).
- [ ] The status history section on the task detail modal renders rows newest-first.
- [ ] A status change without a note still writes the history row (notes is optional).
- [ ] Bookkeeper can change status only on tasks where `assignedBookkeeperId == request.auth.uid`; admin can change any.
- [ ] Vitest covers the legal-next-status reducer. Emulator tests cover the rules and the audit write.

## Blocked by

- Attach form to client (creates first task) (#8)
