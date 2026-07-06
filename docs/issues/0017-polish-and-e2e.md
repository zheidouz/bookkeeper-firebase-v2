## Parent

Bookkeeper & Tax Filing Dashboard v1 — https://github.com/zheidouz/bookkeeper-firebase-v2/issues/1

## What to build

The polish slice: a real sidebar (not the placeholder from #3), consistent loading/empty/error states across every list view, confirmation Dialogs for every destructive action (Delete, Archive), responsive layout pass on mobile, and a Playwright critical-e2e suite covering the 5 paths the PRD locked (login → archive → next task visible, role-restricted reads, etc.).

Specifically:

- Real `<Sidebar />` with nav items Dashboard / Clients / Tax Forms / Tasks / Archive / Users / Settings (Settings is a placeholder route showing a "Coming soon" card). Active route highlighted.
- A shared `<AsyncBoundary />` wrapper used by every list page (clients, tax forms, tasks, users, archive) — renders skeleton during load, the list on success, an empty-state component on `length === 0`, and an error card with retry on failure.
- Every destructive action (Delete task, Delete client, Archive task, Disable user) goes through a shared `<ConfirmDialog action=…>` with the action's name and consequences.
- Responsive pass: every page usable on a 375px-wide viewport. Tables become cards or get horizontal scroll on small screens.
- Playwright e2e suite (5 paths from PRD story 65–76):
  1. Login as admin → create user → log out → log in as new user.
  2. Login as bookkeeper → attach 2550Q → mark Ready → Submitted → Done → Archive → next Q task appears.
  3. Login as bookkeeper A → confirm bookkeeper B's task is read-only → edit own task.
  4. Login as staff → confirm only allowed fields writable on assigned task.
  5. Login as admin → Import/refresh seed → confirm 18 BIR forms present.
- README updated with: how to run e2e, screenshot tour of the app, deploy checklist.

## Acceptance criteria

- [ ] Every list page has loading, empty, and error states.
- [ ] Every destructive action requires confirmation.
- [ ] Sidebar highlights the active route and is keyboard-navigable.
- [ ] Every page is usable on a 375px-wide viewport (manual screenshot check + Playwright viewport assertion).
- [ ] All 5 Playwright critical-e2e paths pass in CI-equivalent (`npm run test:e2e`).
- [ ] README is accurate and includes a screenshot of the dashboard.

## Blocked by

- Dashboard overview (cards + filters + status badges) (#12)
- Task table (list + search + sort + paginate) (#13)
