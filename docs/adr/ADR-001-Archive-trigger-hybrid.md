# ADR-001. Archive trigger: callable + nightly reconciliation

**Status:** Accepted
**Date:** 2026-07-06
**Project:** bookkeeper-firebase-v2

## Context

The recurring-task rule ("archiving a Done task must atomically create the next period's task for the same client and form") is the most write-sensitive operation in the system. It has to fire on demand for good UX, and it has to be correct even when clients drop connections mid-write, admins re-assign, or a future bug lets a task reach Archived without going through the proper flow. Pure client-side logic lets a buggy build leak inconsistencies; pure `onWrite` triggers are fragile under partial writes; a pure nightly cron leaves a window where the UI shows "Done" but no next task exists.

## Decision

Hybrid: the Archive button calls a `httpsCallable` Cloud Function (`archiveTask`) which performs the archive write, the next-task creation, and the `taskStatusHistory` insert in a single Firestore transaction. A nightly scheduled Cloud Function (`reconcileOverdueArchives`) runs at 02:00 in `asia-southeast1` to find any Done task whose deadline has passed by more than 7 days with no successor, and materializes the missing next task. The cron is idempotent (a `previousTaskId` pointer on the successor makes "already created" a one-doc check).

## Consequences

- Happy path: instant feedback after Archive click; no spinner that blocks on a cron.
- Missed-write path: the nightly cron catches gaps within 24 hours; no permanently orphaned clients.
- Drift detection: a `support_reindex_stats` callable can be added later to backfill from `taskStatusHistory` if manual edits ever bypass both paths.
- Two moving parts to keep in sync: any change to "what the next task looks like" must land in both `archiveTask` and the reconciliation function. We factor the next-task builder into a shared `src/lib/recurrence.ts` (imported into the Functions codebase).
- Reconciliation frequency is daily; a tighter SLA (e.g., "next task exists within 1 hour of Done") would require a separate trigger.

## Follow-up

Add a Cloud Scheduler + Pub/Sub-driven hourly reconciliation if the firm ever needs sub-day guarantees.