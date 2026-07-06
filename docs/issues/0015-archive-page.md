## Parent

Bookkeeper & Tax Filing Dashboard v1 — https://github.com/zheidouz/bookkeeper-firebase-v2/issues/1

## What to build

The `/archive` page: a read-only history of all archived tasks, with search (client / year / form / bookkeeper), filter, and "who archived it" / "when archived" columns. Each archived task is openable into the same detail page as #14, but with all write actions disabled.

Specifically:

- Page at `/archive` lists `clientFormTasks` where `archived == true`. Columns: client / form code / form name / period / archived date / archived by (display name).
- Search input (client, form code, year, bookkeeper) and filter by year / form / bookkeeper.
- Clicking a row opens `/tasks/{taskId}` in read-only mode — the existing detail page with all write actions (status change, Edit, Archive, Delete, Notes save, file upload) hidden.
- "Archived at" timestamp rendered relative (e.g., "3 months ago").
- `firestore.rules`: already in place from #10, but this slice adds an explicit test that confirms a non-admin attempting to `update()` an archived task's `status` is denied.

## Acceptance criteria

- [ ] `/archive` lists every archived task (verified via seeded emulator dataset with 10 archived tasks).
- [ ] Search by year and by client works.
- [ ] Opening an archived task shows the detail page with all write actions hidden.
- [ ] A non-admin attempting to `update()` an archived task's status via direct SDK call is rejected by rules.
- [ ] The "archived by" column resolves to the user's display name (not just uid).
- [ ] Vitest covers the search reducer. Emulator tests cover the read-only rule.

## Blocked by

- Archive task → atomic create next (callable) (#10)
