# bookkeeper-firebase-v2

Firebase-powered web dashboard for a Philippine bookkeeping firm to track clients, tax forms, deadlines, filing status, and recurring form cycles.

## Status

- **PRD:** [`docs/prd/bookkeeper-dashboard-v1.md`](docs/prd/bookkeeper-dashboard-v1.md) — v1, ready for `/to-issues`.
- **ADRs:** [`docs/adr/`](docs/adr/) — four locked sticky decisions.
- **Code:** scaffolded (issue #2). No auth, no data routes yet — those come in slices #3+.

## Attach form to client (slice #8)

From `/clients/:id`, a bookkeeper (or admin) clicks **Attach form** in the
"Attached forms" card, picks a tax form, and the system creates the first
`clientFormTasks/{taskId}` document in `pending` status. Per-row **Edit**
and **Remove** actions are available while the task is still `pending`
(per PRD story 29) and the actor is the assigned bookkeeper or an admin.
Firestore rules enforce the same policy server-side. Archived tasks are
filtered out of this view; slice #15 owns the archive page.

## Stack (locked)

- Vite + React 18 + TypeScript SPA on Firebase Hosting
- Firebase Auth (email + password, custom claims)
- Firestore (single-tenant)
- Cloud Functions (2nd gen, Node 20, `asia-southeast1`)
- Cloud Storage (file attachments on tasks)
- shadcn/ui + Tailwind, TanStack Query, React Router v6 (data routers), React Hook Form + Zod
- Vitest + Firebase Emulator Suite + Playwright (critical e2e only)

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