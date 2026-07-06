## Parent

Bookkeeper & Tax Filing Dashboard v1 — https://github.com/zheidouz/bookkeeper-firebase-v2/issues/1

## What to build

The task table at `/tasks`: the main working surface for bookkeepers. Columns per the PRD story 50 (client / form code / form name / frequency / period / deadline / assigned bookkeeper / status / days remaining / actions), with search, sort, pagination, and per-row actions (View, Edit, Change status, Mark as Ready/Submitted/Done, Archive, Delete-admin-only).

Specifically:

- `<TaskTable />` (shadcn `Table`) with the 10 columns.
- Sortable on `deadline` (default asc), `client.businessName`, `formCode`. Sortable headers show a directional indicator.
- Search input filters across `client.businessName`, `taxForm.formCode`, `taxForm.formName` (case-insensitive, debounced 200ms).
- Pagination at 50 rows per page, page-size selector (25/50/100).
- Per-row Actions dropdown: View (opens #14 modal), Edit (only when `status == 'pending'`), Change status (the legal-next actions from #10), Archive (only when `status == 'done'`, calls #11), Delete (admin-only, only when `status == 'pending'`).
- Reuses the dashboard filter strip from #13.
- React Router lazy-loads this route so the main bundle stays light.

## Acceptance criteria

- [ ] Table renders all 10 columns and is sortable on at least `deadline`, `client.businessName`, `formCode`.
- [ ] Search input filters the visible rows in real time (debounced).
- [ ] Pagination works at 50 rows/page; switching to 100 re-paginates.
- [ ] Actions dropdown shows only legal actions for the current status (e.g., Archive hidden until `done`).
- [ ] Delete is admin-only and only on `pending` tasks.
- [ ] Lazy route bundle is verified via `vite build` output analysis.
- [ ] Vitest covers the sort + filter reducers. The full table is exercised via Playwright critical-e2e in #18.

## Blocked by

- Status workflow + transitions + audit history (#9)
