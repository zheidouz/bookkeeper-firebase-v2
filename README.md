# bookkeeper-firebase-v2

Firebase-powered web dashboard for a Philippine bookkeeping firm to track clients, tax forms, deadlines, filing status, and recurring form cycles.

## Status

- **PRD:** [`docs/prd/bookkeeper-dashboard-v1.md`](docs/prd/bookkeeper-dashboard-v1.md) — v1, ready for `/to-issues`.
- **ADRs:** [`docs/adr/`](docs/adr/) — four locked sticky decisions.
- **Code:** not yet scaffolded.

## Stack (locked)

- Vite + React 18 + TypeScript SPA on Firebase Hosting
- Firebase Auth (email + password, custom claims)
- Firestore (single-tenant)
- Cloud Functions (2nd gen, `asia-southeast1`)
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

## Local dev (once scaffolded)

```bash
npm install
npm run dev   # firebase emulators:start + vite, concurrently
```

## Build / deploy (once scaffolded)

```bash
npm run build
firebase deploy
```