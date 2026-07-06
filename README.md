# bookkeeper-firebase-v2

Firebase-powered web dashboard for a Philippine bookkeeping firm to track clients, tax forms, deadlines, filing status, and recurring form cycles.

## Status

- **PRD:** [`docs/prd/bookkeeper-dashboard-v1.md`](docs/prd/bookkeeper-dashboard-v1.md) — v1, ready for `/to-issues`.
- **ADRs:** [`docs/adr/`](docs/adr/) — four locked sticky decisions.
- **Code:** slices #2 + #3 + #4 + #5 + #6 + #7 + #8 + #9 + #10 + #11 + #12 shipped on `feat/issue-chain`. Status workflow + audit history + archive callable + nightly reconciliation + dashboard overview land with this slice.

## Attach form to client (slice #8)

From `/clients/:id`, a bookkeeper (or admin) clicks **Attach form** in the
"Attached forms" card, picks a tax form, and the system creates the first
`clientFormTasks/{taskId}` document in `pending` status. Per-row **Edit**
and **Remove** actions are available while the task is still `pending`
(per PRD story 29) and the actor is the assigned bookkeeper or an admin.
Firestore rules enforce the same policy server-side. Archived tasks are
filtered out of this view; slice #15 owns the archive page.

## Status workflow + audit history

From `/clients/:id`, a bookkeeper (or admin) advances a task through
its workflow (`pending → ready_to_file → submitted → done`) via
inline buttons in the **Attached forms** card. The "Change with note…"
button opens a dialog that lets the actor attach an optional free-text
note to the transition. Every state change appends a row to the
append-only `taskStatusHistory/{historyId}` collection; the row's
`oldStatus` / `newStatus` / `changedBy` / `changedAt` / `notes` are
frozen at write time. The history disclosure (toggle per row) renders
the recent rows newest-first.

The reducer (`src/features/clientFormTasks/statusReducer.ts`) is the
single source of truth for legal next-statuses and is enforced a
second time by Firestore rules — an illegal jump (e.g.
`pending → done` directly) is rejected both by the client SDK and by
the rules. Bookkeepers can change status only on tasks where they are
the assigned bookkeeper; admins can change any. History rows are
append-only for everyone (no update / delete).

## Stack (locked)

- Vite + React 18 + TypeScript SPA on Firebase Hosting
- Firebase Auth (email + password, custom claims)
- Firestore (single-tenant)
- Cloud Functions (2nd gen, Node 20, `asia-southeast1`)
- Cloud Storage (file attachments on tasks)
- shadcn/ui + Tailwind, TanStack Query, React Router v6 (data routers), React Hook Form + Zod
- Vitest + Firebase Emulator Suite + Playwright (critical e2e only)

## Nightly reconciliation (slice #11)

`reconcileOverdueArchives` is a Cloud Function v2 `onSchedule` that
runs every day at 02:00 (Asia/Manila) and finds `done` tasks whose
`deadlineDate + 7 days` has passed with no successor (`nextTaskId == null`).
For each, it runs the same `buildNextTask` + transaction that
`archiveTask` uses, marking the current task `archived` and creating
the next-period task with `status: 'pending'`. The audit row goes
into `taskStatusHistory` with `changedBy: "system:reconcile"` so
dashboards can distinguish cron-driven vs user-driven archives.

## Dashboard overview (slice #12)

`/` is the firm's filing-health overview: eight summary cards
(Pending / Ready to file / Submitted / Done / Overdue / Due this
month / Due this quarter / Archived), a filter strip (client / form
type / status / overdue-only live; the rest marked "coming soon"),
and a **My tasks vs All-firm tasks** scope toggle. Bookkeepers
default to **Mine**; admins default to **All-firm**. The cards
update live via a single `onSnapshot` on `clientFormTasks` — when
another user changes a task's status, the relevant card re-renders
within the same second. The aggregator and urgency helper live in
`src/features/dashboard/dashboardCounts.ts` (pure, no React, no
Firestore) and are unit-tested in `tests/unit/useDashboardCounts.test.ts`
and `tests/unit/dashboard-badges.test.ts`. The live-update path is
covered end-to-end against the emulator in
`tests/integration/dashboard.test.tsx`. Slice #13 will mount the
filter-aware task table below the filter strip; that area is a
placeholder for now.

The schedule is configurable via env: `RECONCILE_CRON` (default
`"0 2 * * *"`), `RECONCILE_TIMEZONE` (default `"Asia/Manila"`).
Region comes from the global `setGlobalOptions({ region: "asia-southeast1" })`
in `functions/src/index.ts`.

## Documentation

| Doc | Purpose |
|---|---|
| `docs/prd/bookkeeper-dashboard-v1.md` | Product requirements, user stories, implementation/testing decisions |
| `docs/adr/ADR-001-Archive-trigger-hybrid.md` | Why archive uses a callable + nightly cron, not just one or the other |
| `docs/adr/ADR-002-Task-materialization-current-only.md` | Why we store only the current task per (client, form, period) |
| `docs/adr/ADR-003-Deadline-calculator-holiday-shift.md` | Why deadlines are algorithmic + holiday table, not a hardcoded lookup |
| `docs/adr/ADR-004-Single-tenant-per-project.md` | Why one Firebase project per firm, no `firmId` field |

## Local dev

```bash
# 1. Install (root + functions)
npm install
npm install --prefix functions

# 2. Start emulators + Vite concurrently
#    - Firebase emulator UI: http://127.0.0.1:4000
#    - Auth: 9099 · Firestore: 8080 · Functions: 5001 · Hosting: 5000 · Storage: 9199
#    - Vite dev server:      http://localhost:5173
npm run dev
```

`VITE_USE_EMULATOR=true` is set automatically by the dev workflow; the SDK
points at `127.0.0.1` and never touches a real Firebase project. To run against
a real project, copy `.env.example` to `.env.local`, fill in `VITE_FIREBASE_*`,
and set `VITE_USE_EMULATOR=false` before `npm run dev`.

Emulator state is persisted to `./firebase-emulators-data/` (gitignored) — the
next `npm run dev` picks up where the last one left off.

## Build / deploy

```bash
# Type-check + production build → ./dist/
npm run build

# Compile Cloud Functions → ./functions/lib/
npm --prefix functions run build

# Deploy everything (requires `firebase login` + a real project)
firebase deploy
```

## Deadline calculator

The deadline math lives in `src/lib/deadline.ts` (`calculateNextDeadline`)
and `src/lib/recurrence.ts` (`nextPeriod`). Both modules are pure functions
with no Firebase dependencies — safe to call from the React client or from
Cloud Functions. A mirrored copy is kept under `functions/src/lib/` because
the Functions runtime can't import from `src/` directly; keep the two copies
in sync (see `docs/issues/0007-deadline-calculator.md`). The CURATED list
of Philippine regular holidays + special non-working days for 2026 and 2027
lives in `functions/src/birHolidaysData.ts` and is loaded into
`birHolidays/{year}` (top-level collection, year as document ID) by the
`seedBirHolidays` callable (admin-only, idempotent via `merge: true`).
Slice #4 ships this slice; UI consumption comes in later slices.

## Tax form library

The `/tax-forms` route (slice #6) is the master library of BIR tax forms.
Any signed-in user can read; bookkeepers + admins can create and edit
custom forms; only admins can delete. The page is populated by clicking
**Import/refresh seed** (admin-only), which imports the hardcoded seed at
`src/seed/birForms.json` (the 18 PRD-named BIR forms). The merge logic
lives in `src/lib/mergeSeedForms.ts` as a pure function: re-running the
import never duplicates a row, and user-edited fields on an existing row
are preserved (the import skips rows where any user-editable field has
been changed since the original seed).

## Client CRUD

The `/clients` route (slice #7) is the working list of clients.
Bookkeepers + admins can create, edit, and archive (soft-delete) clients;
staff see a read-only list. Search filters by business name, owner name,
or TIN. Client-side pagination at 25 rows per page. The "Show archived"
toggle controls whether archived rows (grey + italic) appear in the list.
The detail view at `/clients/:id` shows the full record + Edit button,
plus a placeholder **Attached forms** section that slice #8 populates.
Firestore rules (`firestore.rules`) grant read on non-archived clients
to any signed-in user, list access to anyone signed in, create/update
to bookkeeper + admin, and hard delete to admin only.