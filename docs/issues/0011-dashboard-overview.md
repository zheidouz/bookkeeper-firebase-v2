## Parent

Bookkeeper & Tax Filing Dashboard v1 — https://github.com/zheidouz/bookkeeper-firebase-v2/issues/1

## What to build

The dashboard overview at `/`: eight summary cards (Pending / Ready to File / Submitted / Done / Overdue / Due this month / Due this quarter / Archived), a filter strip (client / form type / status / deadline type / month / quarter / year / assigned bookkeeper / overdue-only), a status badge component, and the "my tasks vs all-firm tasks" toggle for bookkeepers. After this slice, the firm's filing health is visible at a glance.

Specifically:

- New TanStack Query hooks:
  - `useDashboardCounts(scope: 'mine' | 'all')` — 8-card aggregation, computed via a single `clientFormTasks` query grouped by status + deadline window.
  - `useFilteredTasks(filters)` — returns the same list as #13's table but with the dashboard filter shape.
- A `<StatusBadge status={…} deadline={…} />` component: green (not urgent, >14 days), yellow (≤14 days), red (overdue), grey (`archived`).
- The dashboard filter strip is a single component shared with the task table filter (#13) so behaviour matches.
- "My tasks vs All-firm tasks" toggle at the top of `/`: bookkeepers default to "mine"; admins default to "all".
- Responsive: cards reflow to 2-column on tablet, 1-column on mobile; filter strip becomes a collapsible Drawer below the `md` breakpoint.

## Acceptance criteria

- [ ] All eight summary cards render with the correct counts (verified against a seeded emulator dataset).
- [ ] Cards update in real time when a task's status changes elsewhere (via Firestore `onSnapshot` integration).
- [ ] Overdue tasks show red badges; due-within-14-days tasks show yellow; everything else green.
- [ ] The "My tasks vs All-firm tasks" toggle works for both roles.
- [ ] Filter changes update the displayed counts (where the filter applies) and the underlying task list.
- [ ] Vitest covers the StatusBadge color logic and the count aggregator. Emulator tests cover the live-update path.

## Blocked by

- Status workflow + transitions + audit history (#9)
