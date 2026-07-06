## Parent

Bookkeeper & Tax Filing Dashboard v1 — https://github.com/zheidouz/bookkeeper-firebase-v2/issues/1

## What to build

The archive action: when a bookkeeper clicks "Archive" on a `done` task, a callable Cloud Function (`archiveTask`) atomically (a) marks the current task `archived: true`, sets `archivedAt`, sets `archivedBy`, and (b) creates the next period's task with `status: 'pending'`, copying client/form/frequency/bookkeeper from the current task. After this slice, archiving rolls forward deterministically and the UI shows the next period appearing.

Specifically:

- Cloud Function `archiveTask({taskId, notes?})`:
  1. Reads the current task. Refuses if `status != 'done'` or `archived == true`.
  2. Refuses if a task already exists for `(clientId, taxFormId, nextPeriodStart)` — duplicate guard per PRD story 38.
  3. Uses `nextPeriod()` from #9 to compute the new period.
  4. Computes `nextDeadline` via `calculateNextDeadline` from #9.
  5. In a single Firestore transaction: writes the new task, updates the current task with `archived: true, archivedAt: now, archivedBy: uid, nextTaskId: newId`, writes one `taskStatusHistory` row for the archive transition.
  6. Returns `{ archivedTaskId, newTaskId, newDeadline }` so the UI can show a success toast with the next deadline.
- UI: "Archive" button on the task row and detail modal — only visible when `status == 'done'` (PRD story 34). Click opens a confirmation Dialog showing the next period range and next deadline before committing (PRD story 35). On success, the row is hidden from the active list; the next-period task appears as a new pending row.
- `firestore.rules`: clients cannot directly set `archived: true`; the SDK-direct path is replaced by the callable for that field. The callable enforces "only bookkeeper assigned to the task or admin can archive."

## Acceptance criteria

- [ ] Clicking Archive on a done task shows the confirmation dialog with the correct next-period range and deadline.
- [ ] Confirming writes the archive (status, archivedAt, archivedBy, nextTaskId) and creates the next-period task with status `pending`, all in one transaction.
- [ ] A second archive click on the same task is refused (status no longer `done`).
- [ ] Attempting to archive a task that's not assigned to the caller (and not admin) is rejected by the callable.
- [ ] Manual double-archive via two parallel callables is rejected by the duplicate guard (test in emulator).
- [ ] The new task's `previousTaskId` points to the just-archived task, and the archived task's `nextTaskId` points back to the new one.
- [ ] Emulator integration tests cover happy path, double-archive rejection, and the duplicate-guard path.

## Blocked by

- Deadline calculator + BIR holiday seeding (#4)
- Status workflow + transitions + audit history (#9)
