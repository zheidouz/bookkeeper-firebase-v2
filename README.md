# bookkeeper-firebase-v2

Firebase-powered web dashboard for a Philippine bookkeeping firm to track clients, tax forms, deadlines, filing status, and recurring form cycles.

## Status

- **PRD:** [`docs/prd/bookkeeper-dashboard-v1.md`](docs/prd/bookkeeper-dashboard-v1.md) — v1, ready for `/to-issues`.
- **ADRs:** [`docs/adr/`](docs/adr/) — four locked sticky decisions.
- **Code:** scaffolded (issue #2). No auth, no data routes yet — those come in slices #3+.

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