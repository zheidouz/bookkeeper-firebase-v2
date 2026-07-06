## Parent

Bookkeeper & Tax Filing Dashboard v1 — https://github.com/zheidouz/bookkeeper-firebase-v2/issues/1

## What to build

The nightly reconciliation cron: a scheduled Cloud Function (`reconcileOverdueArchives`) that runs every day at 02:00 in `asia-southeast1`, finds Done tasks whose `deadlineDate + 7 days` has passed with no `nextTaskId`, and creates the missing next-period task using the same `nextPeriod()` + `calculateNextDeadline` from #9. Idempotent. Catches the gaps that #11's callable missed (dropped writes, admin overrides, future bugs).

Specifically:

- Cloud Function `reconcileOverdueArchives` (Pub/Sub-triggered on a 24h schedule; or `scheduler.schedule()` on Functions v2).
- Algorithm:
  1. Query `clientFormTasks` where `status == 'done'`, `archived == false`, `nextTaskId == null`, `deadlineDate < now - 7d`.
  2. For each, run the same `archiveTask` body but skip the client-confirmation step (no UI). Use the same duplicate guard.
  3. Write a `support_audit_events/{auto-id}` row noting which task was reconciled, by `system:reconcile`, with the same shape as `taskStatusHistory`.
- Idempotency: the `nextTaskId` pointer check means a second run picks up nothing new.
- Configurable schedule via env var `RECONCILE_CRON` (default `"0 2 * * *"`) and region via `RECONCILE_REGION` (default `"asia-southeast1"`).

## Acceptance criteria

- [ ] The function is deployed and visible in the Functions emulator UI as a scheduled function.
- [ ] Manually invoking the function (via the emulator's "Run now" or via direct trigger) with a seeded done task past `deadlineDate + 7d` and no successor creates the next-period task.
- [ ] Running the function a second time on the same seeded data creates nothing (no duplicate).
- [ ] A task with `nextTaskId != null` is ignored.
- [ ] A task that is `done` but whose `deadlineDate` is within the last 7 days is ignored.
- [ ] The audit row written by the cron is distinguishable from user-driven archives (via `changedBy: 'system:reconcile'`).
- [ ] Emulator integration test covers the seeded scenarios.

## Blocked by

- Archive task → atomic create next (callable) (#10)
