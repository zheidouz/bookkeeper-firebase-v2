## Parent

Bookkeeper & Tax Filing Dashboard v1 — https://github.com/zheidouz/bookkeeper-firebase-v2/issues/1

## What to build

The final tightening of Firestore security rules across all collections, codifying the role matrix from the PRD: admin read/write all; bookkeeper read all clients/forms/users and update only assigned tasks; staff read clients/forms, write only a fixed allowlist of fields on assigned tasks; archived rows readable by all, writable by admin only; `taskStatusHistory` append-only. Plus a comprehensive emulator test suite covering every role × collection matrix.

Specifically:

- Single consolidated `firestore.rules` file with helper functions (`isAdmin`, `isBookkeeper`, `isStaff`, `isAssignedTo`, `isArchived`, `isImmutable`).
- Per-collection rules explicitly state the allowed read/write expressions, not "match anything reasonable".
- Staff write allowlist: only `notes` and the `encoderNotes` subcollection fields. Tested explicitly: staff attempting to write `status`, `assignedBookkeeperId`, `archived` is denied.
- Comprehensive `@firebase/rules-unit-testing` matrix (or equivalent) covering every role × collection × action combination. Test names follow `<role>-<collection>-<action>-<expected>` (e.g., `staff-tasks-update-status-denied`).
- `support_reindex_stats` callable (per ADR-003) added as a stub for future use.

## Acceptance criteria

- [ ] Every cell in the role × collection × action matrix has a passing test.
- [ ] The rules file compiles and deploys without warnings.
- [ ] No collection is left with the placeholder deny-all from #2 (or, if it is, it's intentional and documented).
- [ ] Staff attempting to write a forbidden field on an assigned task is denied.
- [ ] Bookkeeper attempting to update another bookkeeper's assigned task is denied.
- [ ] Archived rows are writable only by admin (verified per collection).
- [ ] `taskStatusHistory` cannot be updated or deleted by any role after creation.

## Blocked by

- Archive task → atomic create next (callable) (#10)
- Task detail page (history + notes + actions) (#14)
- Archive page (read-only history) (#15)
