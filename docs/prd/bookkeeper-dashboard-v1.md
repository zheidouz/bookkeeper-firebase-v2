# PRD: Bookkeeper & Tax Filing Dashboard

**Project:** bookkeeper-firebase-v2
**Slug:** `bookkeeper-dashboard`
**Version:** v1
**Status:** Draft → ready for `/to-issues`

---

## Problem Statement

A Philippine bookkeeping firm manages recurring tax-filing obligations for many clients across many forms (BIR 1601C, 2550Q, 1701A, 2307, etc.). Today the firm tracks these obligations in spreadsheets and chat threads, which causes three concrete failures:

1. **Missed deadlines** — when a task rolls from one period to the next (e.g., 2550Q for Q1 → Q2), it gets re-created manually or forgotten. Late filings incur penalties.
2. **No audit trail** — there is no record of who changed a filing's status, when, or why. Compliance reviews and internal handoffs lose context.
3. **No role-aware access** — encoders, bookkeepers, and the firm admin all touch the same spreadsheet, so anyone can change anyone's work-in-progress.

The firm needs a single internal web dashboard where each recurring filing is a first-class task with a deterministic deadline, an audit trail, and a clean role-based view.

## Solution

A Firebase-hosted web dashboard with these characteristics:

- **Vite + React + TypeScript SPA** deployed to Firebase Hosting, with Firebase Auth + Firestore + Cloud Functions + Cloud Storage as the full backend surface.
- **One materialised task per (client, form, current period).** When a Done task is archived, a Cloud Function atomically writes the next period's task. A nightly cron reconciles any gaps.
- **Deterministic deadline calculator** combining per-form algorithmic rules with a BIR holiday shift table stored in Firestore.
- **Role-based access** enforced via Firebase Auth custom claims (`admin`, `bookkeeper`, `staff`) consumed by Firestore security rules; profile data still stored in `users/{uid}`.
- **Single-tenant deployment** — one Firebase project per firm, no `firmId` field anywhere.

See `docs/adr/ADR-001` through `ADR-004` for the four sticky decisions (hybrid archive trigger, current-only task materialization, algorithmic + holiday deadline calculator, single-tenant per project).

## User Stories

### Authentication & onboarding

1. As an **admin**, I want to invite new users via an admin-only "Create user" form, so that bookkeepers and staff get into the system without self-signup.
2. As an **admin**, I want to assign a role (`admin`, `bookkeeper`, `staff`) when creating a user, so that permissions are correct from day one.
3. As an **admin**, I want to change a user's role later, so that promotions and reassignments take effect without recreating the account.
4. As any **user**, I want to log in with email + password, so that I can access the dashboard from a browser without extra tooling.
5. As any **user**, I want to log out from any page, so that I can leave a shared workstation safely.
6. As a **bookkeeper**, I want to see my own name and role in the top bar, so that I'm sure I'm acting as the right person.
7. As any **user**, I want my session to expire after inactivity, so that a forgotten logged-in browser doesn't stay open to the firm.
8. As an **admin**, I want new users to receive a one-time set-password link out-of-band, so that I never see their long-term password.

### Dashboard overview

9. As a **bookkeeper**, I want a dashboard with summary cards (Pending / Ready to File / Submitted / Done / Overdue / Due this month / Due this quarter / Archived), so that I can see the firm's filing health at a glance.
10. As a **bookkeeper**, I want dashboard cards to update in real time when a status changes elsewhere, so that I don't act on stale numbers.
11. As a **bookkeeper**, I want to filter the task list by client, form type, status, deadline type, month, quarter, year, assigned bookkeeper, and overdue-only, so that I can drill into the slice I care about.
12. As a **bookkeeper**, I want to see only tasks assigned to me by default, with a toggle to see all-firm tasks, so that my "today" view is uncluttered.
13. As a **bookkeeper**, I want overdue tasks to be visually red, due-soon tasks yellow, and on-track tasks green, so that urgency is obvious without reading numbers.
14. As an **admin**, I want the same dashboard with all-firm visibility by default, so that I can spot problems across the firm.

### Client management

15. As a **bookkeeper**, I want to create a new client (business name, owner, TIN, RDO, address, contact, email, assigned bookkeeper, status, notes), so that the firm can start tracking that client's filings.
16. As a **bookkeeper**, I want to edit any client field, so that details stay current as the business changes.
17. As a **bookkeeper**, I want to archive a client (without losing their filing history), so that churned clients stop appearing in active lists but remain auditable.
18. As a **bookkeeper**, I want to see all tax forms currently attached to a client, so that I have a single-screen view of one client's obligations.
19. As a **bookkeeper**, I want to search clients by business name, owner name, or TIN, so that I can find them quickly when the list grows.
20. As a **bookkeeper**, I want the client list to paginate, so that scrolling stays fast even with hundreds of clients.

### Tax form library

21. As an **admin**, I want the system pre-seeded with common Philippine BIR forms (1601C, 0619E, 0619F, 1601EQ, 1601FQ, 2550M, 2550Q, 1701Q, 1701A, 1702Q, 1702RT, 1702EX, 1702MX, 2307, 2316, 0605, 2000, 2000-OT), so that I don't re-enter reference data.
22. As an **admin**, I want to click an "Import/refresh seed" button to re-sync the seed library without redeploying code, so that adding new BIR-published forms is a one-click operation.
23. As an **bookkeeper**, I want to create a custom tax form (e.g., a city-specific form), so that the firm can track non-standard obligations.
24. As a **bookkeeper**, I want to disable a tax form (mark inactive) rather than delete it, so that historical filings keep referencing the right form code.
25. As a **bookkeeper**, I want each form to have a filing frequency (monthly, quarterly, semi-annual, annual, custom) and a default deadline rule, so that attaching the form to a client pre-fills the cadence.

### Attaching forms to clients

26. As a **bookkeeper**, I want to attach a tax form to a client, picking the form, frequency, period covered, deadline, and assigned bookkeeper, so that the client has a tracked obligation.
27. As a **bookkeeper**, I want one client to have multiple forms attached, including duplicates of the same form code at different periods, so that the system handles both one-time and recurring filings.
28. As a **bookkeeper**, I want to override the form's default deadline per task, so that special situations (e.g., a client's extension) are respected.
29. As a **bookkeeper**, I want to edit or remove an attached form while it is still Pending, so that attaching mistakes are reversible.

### Task status workflow

30. As a **bookkeeper**, I want a newly attached task to start in `pending` status, so that the workflow state is explicit.
31. As a **bookkeeper**, I want to move a task through `pending → ready_to_file → submitted → done`, so that progress is visible.
32. As a **bookkeeper**, I want to add a free-text note when changing status, so that the reason for the change is preserved.
33. As a **bookkeeper**, I want status transitions to be enforced server-side (rules reject illegal jumps like `pending → done`), so that the workflow stays clean.
34. As a **bookkeeper**, I want to see an "Archive" button only when the task is `done`, so that archive cannot be triggered prematurely.
35. As a **bookkeeper**, I want to confirm the archive in a dialog that shows the next period's computed deadline, so that I can verify before committing.
36. As a **bookkeeper**, I want the archive action to atomically (a) mark the current task archived and (b) create the next period's task as `pending`, so that no filing falls through the gap.
37. As a **bookkeeper**, I want the new task to preserve client, form, frequency, and bookkeeper, so that archive is a "roll forward" not a re-entry.
38. As a **bookkeeper**, I want the system to refuse creating a duplicate next-period task if one already exists for the same (client, form, period), so that accidental double-archives don't create ghost tasks.
39. As an **admin**, I want to delete a Pending task without archiving, so that I can cancel an attach-by-mistake.
40. As a **bookkeeper**, I want to delete only my own Pending tasks, so that I can't accidentally remove someone else's work.

### Deadline automation

41. As a **bookkeeper**, I want monthly forms to roll forward one month on archive, so that I never manually re-enter the cadence.
42. As a **bookkeeper**, I want quarterly forms to roll forward one quarter on archive, so that the next Q is automatically pending.
43. As a **bookkeeper**, I want semi-annual forms to roll forward 6 months on archive.
44. As a **bookkeeper**, I want annual forms to roll forward one year on archive.
45. As a **bookkeeper**, I want custom-frequency forms to require manual next-deadline entry, so that the system never invents a date it doesn't know.
46. As a **bookkeeper**, I want each task to store `periodStart`, `periodEnd`, `deadlineDate`, `frequency`, `year`, and `monthOrQuarter`, so that all dashboard filters work without recomputation.
47. As a **bookkeeper**, I want deadlines to shift around BIR non-working days automatically, so that I don't file on a holiday.
48. As an **admin**, I want to add new BIR non-working days by writing to a `config/birHolidays/{year}` document, so that holiday updates don't need code changes.
49. As a **bookkeeper**, I want to see "days remaining" (negative = overdue) on every task, so that urgency is numerical, not just colored.

### Task table

50. As a **bookkeeper**, I want a main task table with columns: client, form code, form name, frequency, period covered, deadline, assigned bookkeeper, status, days remaining, and actions, so that I can scan all my work.
51. As a **bookkeeper**, I want per-row actions: View, Edit, Change status, Mark as Ready to File, Mark as Submitted, Mark as Done, Archive, Delete (admin only), so that each task is actionable without leaving the table.
52. As a **bookkeeper**, I want the table to be searchable by client or form code, so that I can find one task fast.
53. As a **bookkeeper**, I want the table to support pagination (50 rows per page), so that it stays fast.
54. As a **bookkeeper**, I want the table to sort by deadline ascending by default, so that the most urgent is on top.

### Task detail

55. As a **bookkeeper**, I want to open a task and see client details, form details, deadline details, filing history, status history, notes, and any uploaded files, so that everything about a task is one click away.
56. As a **bookkeeper**, I want status history to show old → new status, who changed it, and when, so that I can answer "who moved this to ready last week?".
57. As a **bookkeeper**, I want to upload a PDF (e.g., the filed return) to a task and later download it, so that receipts are co-located with the task.
58. As a **bookkeeper**, I want status change buttons on the detail view, so that I can update without going back to the table.
59. As a **bookkeeper**, I want to add a note to the task without changing status, so that context is captured.

### Archive & history

60. As a **bookkeeper**, I want an Archive page where archived tasks are listed, so that the main task table stays focused on active work.
61. As a **bookkeeper**, I want to search archived tasks by client, year, form, or bookkeeper, so that historical lookups are fast.
62. As a **bookkeeper**, I want each archived task to show when and by whom it was archived, so that audits are straightforward.
63. As a **bookkeeper**, I want to open any archived task and see its full history (period covered, who filed, attached files), so that the firm has a complete filing record.
64. As a **bookkeeper**, I want archived records to be read-only — no edits, no status changes, so that the audit trail is immutable.

### Operational & data integrity

65. As an **admin**, I want a nightly reconciliation cron to find any Done task whose successor is missing and create it, so that a dropped archive write doesn't permanently lose the next period.
66. As an **admin**, I want the reconciliation cron to be idempotent (no duplicates if it runs twice), so that retries are safe.
67. As an **admin**, I want Firestore security rules to prevent a bookkeeper from editing another bookkeeper's task, so that the workflow stays clean.
68. As an **admin**, I want staff to write only allowed fields on assigned tasks, so that encoders can't change bookkeeping fields.
69. As an **admin**, I want deletion to require Admin role, so that no one accidentally removes history.
70. As an **admin**, I want archived tasks to be readable by all roles but not editable, so that audit visibility is preserved.
71. As an **admin**, I want every status transition to be appended to `taskStatusHistory`, so that I have a tamper-resistant audit log.

### UX & responsiveness

72. As any **user**, I want the layout to use a sidebar (Dashboard / Clients / Tax Forms / Tasks / Archive / Users / Settings) so that navigation is consistent.
73. As any **user**, I want the dashboard to be usable on a phone, so that bookkeepers can check urgency on the go.
74. As any **user**, I want loading and empty states for every list view, so that I never see a blank screen.
75. As any **user**, I want destructive actions (delete, archive) to require confirmation, so that mistakes are recoverable.
76. As any **user**, I want status badges (Pending / Ready / Submitted / Done / Archived / Overdue) to be color-coded, so that I can scan a row quickly.

## Implementation Decisions

### Stack & infra (locked from grill-me Q1, Q2, Q5, Q7–Q14)

- **Frontend:** Vite + React 18 + TypeScript SPA, deployed to Firebase Hosting.
- **Styling:** Tailwind CSS + shadcn/ui (Radix primitives).
- **Data fetching:** TanStack Query for cache/pagination/devtools; Firestore `onSnapshot` subscriptions wrapped in custom hooks for real-time lists.
- **Routing:** React Router v6 in data-router mode, with lazy route splits for the task table bundle.
- **Forms & validation:** React Hook Form + Zod. The same Zod schemas are imported into Cloud Functions for server-side validation, keeping client and server in sync.
- **Auth:** Firebase Auth, email + password only. Public signup disabled in Firebase Auth settings. New users are created by an admin via a `adminCreateUser` callable (Firebase Admin SDK).
- **RBAC:** Custom claims (`role`) set by a `assignRole` callable. `users/{uid}` stores the full profile for UI/listing.
- **Database:** Firestore. Single-tenant — one Firebase project per firm, no `firmId` field anywhere (see ADR-004).
- **Server logic:** Firebase Cloud Functions (2nd gen, `asia-southeast1`). Callable for `archiveTask`, `assignRole`, `adminCreateUser`, `reconcileOverdueArchives` (scheduled). Shared `recurrence.ts` and `deadline.ts` modules are imported by both the client and Functions codebases.
- **Storage:** Firebase Storage under `tasks/{taskId}/files/{fileId}`. Signed URLs on read. Paths stored on the task document.
- **Seed data:** Hardcoded `src/seed/birForms.json` (18 common BIR forms) plus an admin "Import/refresh seed" button. Re-seedable without code redeploy.
- **Local dev:** Firebase Emulator Suite (Auth :9099, Firestore :8080, Functions :5001, Hosting :5000) + Vite (:5173) via `concurrently`.

### Data model (locked from grill-me Q4, Q5; cross-referenced with ADR-002)

Collections:

- `users/{uid}` — `{name, email, role, status, createdAt, updatedAt}`.
- `clients/{clientId}` — `{businessName, ownerName, tin, rdo, address, contactNumber, email, assignedBookkeeperId, status, notes, createdAt, updatedAt}`.
- `taxForms/{formId}` — `{formCode, formName, description, category, defaultFrequency, defaultDeadlineRule, deadlineShift?, isActive, createdAt, updatedAt}`.
- `clientFormTasks/{taskId}` — `{clientId, taxFormId, assignedBookkeeperId, frequency, periodStart, periodEnd, deadlineDate, status, archived, archivedAt?, archivedBy?, previousTaskId?, nextTaskId?, notes, createdAt, updatedAt}`.
- `taskStatusHistory/{historyId}` — `{taskId, oldStatus, newStatus, changedBy, changedAt, notes}`.
- `config/birHolidays/{year}` — array of non-working-day ISO strings for that year.

Indexes: `clientFormTasks` is queried by `assignedBookkeeperId + status`, by `deadlineDate + status`, by `clientId + status`. `taskStatusHistory` is queried by `taskId + changedAt desc`. Index plan lives in `firestore.indexes.json`.

### Recurring-task engine (locked from ADR-001, ADR-002)

- **Materialization:** only the current task per (client, form, period) exists. The dashboard's "Pending" count is exact (`where('status','==','pending')`).
- **Trigger:** `archiveTask` (callable) writes the archive + creates the successor in one Firestore transaction. Returns the new task ID so the UI can navigate.
- **Reconciliation:** `reconcileOverdueArchives` runs nightly at 02:00. Finds Done tasks past `deadlineDate + 7 days` with no successor (`nextTaskId` is null) and creates the missing next task using the same shared builder.
- **Idempotency:** `previousTaskId` on the successor makes "already created" a one-doc check before writing.
- **Duplicate guard:** the `archiveTask` callable refuses if a task already exists for `(clientId, taxFormId, nextPeriodStart)`.

### Deadline calculator (locked from ADR-003)

Pure function `calculateNextDeadline(formCode, periodEnd, holidays, shift?): Date` in `src/lib/deadline.ts`, shared between client and Cloud Functions. Algorithm:

1. Look up the form's `defaultDeadlineRule` (e.g., `"lastWorkingDayOfMonthAfterPeriod+1"`).
2. Apply the rule to compute a base date.
3. If the base date is in the holiday set, slide to the next working day. If a `deadlineShift` is set on the form, apply it before holiday sliding.
4. Return the result.

BIR holidays live at `config/birHolidays/{year}`, read once and cached client-side per session. The calculator does not silently fall back when holiday data is missing — it surfaces the gap.

### Security rules shape

- **Admin** (`request.auth.token.role == 'admin'`): read/write all collections, can delete Pending tasks, can edit archived reads.
- **Bookkeeper** (`request.auth.token.role == 'bookkeeper'`): read all `clients`, `taxForms`, `users`. Read all `clientFormTasks`. Update `clientFormTasks` only where `assignedBookkeeperId == request.auth.uid` (with additional rule allowing self-assign of unassigned tasks). Read `taskStatusHistory`. No delete.
- **Staff** (`request.auth.token.role == 'staff'`): read `clients` and `taxForms`. Read/update `clientFormTasks` only where assigned; writes limited to a fixed allowlist of fields (e.g., `notes`, specific `encoderNotes` subcollection). No delete, no archive, no creation.
- **Archived** (`clientFormTasks.archived == true`): readable by all roles, writable by admin only (rules reject non-admin writes).
- **`taskStatusHistory`**: append-only. Admin can read all; bookkeeper/staff can read their own task's history; nobody can update or delete existing rows.

### File upload flow

- Upload path: `tasks/{taskId}/files/{uuid}` in Firebase Storage.
- Rules: only admin or `assignedBookkeeperId` can upload; all roles can read signed URLs.
- UI: drag-and-drop in the task detail view; one-click download via signed URL fetched through a `getFileUrl` callable.

### UI architecture

- Sidebar layout with routes: `/`, `/clients`, `/clients/:id`, `/tax-forms`, `/tasks`, `/tasks/:id`, `/archive`, `/archive/:id`, `/users`, `/settings`.
- Reusable primitives in `src/components/ui/` (Button, Card, Dialog, Dropdown, Form, Input, Select, Table, Toast, Tooltip) sourced from shadcn/ui.
- Feature modules: `src/features/clients/`, `src/features/tasks/`, `src/features/forms/`, `src/features/users/`. Each module owns its components, hooks, and Zod schemas.
- Custom hooks layer over TanStack Query: `useClients()`, `useTasks(filter)`, `useTask(taskId)`, `useArchive()`. Each hook subscribes to `onSnapshot` and feeds the cache.
- Status badges and overdue colors implemented as a single `<StatusBadge status={…} />` component.

## Testing Decisions

### What makes a good test

- Tests assert **external behavior** (a callable returns X given Y input, a rules expression blocks/allows a write, a UI shows the right state) — not implementation details.
- Time-dependent tests freeze `Date.now()` and inject the holiday set explicitly. No real-time assertions.
- The deadline calculator and recurrence builder are tested as pure functions with table-driven fixtures.
- Each Cloud Function has an integration test that exercises real Firestore rules in the emulator, not a mocked DB.

### Modules that will be tested

| Module | Test layer | Notes |
|---|---|---|
| `src/lib/deadline.ts` | Vitest unit | Frozen time + holiday fixtures per form (Q1, Q2, holiday-adjacent, leap year) |
| `src/lib/recurrence.ts` | Vitest unit | Each frequency, edge cases (year boundary, leap day), custom-frequency path |
| Firestore security rules | Emulator + Vitest | Per-role matrix (admin / bookkeeper / staff / unauth) for each collection |
| `archiveTask` callable | Emulator integration | Happy path, idempotency, duplicate guard, race with reconciliation |
| `reconcileOverdueArchives` | Emulator integration | Idempotency, "missing successor" detection |
| `assignRole` / `adminCreateUser` | Emulator integration | Custom claims propagate, profile created |
| React components | Vitest + Testing Library | Status badges, filter chips, table actions render correctly |
| Critical e2e: login → archive → next task visible | Playwright + emulator | The single end-to-end path that, if broken, means the whole product is broken |

### Critical e2e paths (Playwright, ≤ 5)

Per grill-me Q15, full e2e coverage is over-investment for a 7-page admin tool. Playwright covers:

1. Login as admin → create user → log out → log in as the new user.
2. Login as bookkeeper → attach a 2550Q form to a client → mark Ready → Submitted → Done → Archive → see next Q task appear.
3. Login as bookkeeper A → confirm bookkeeper B's task is read-only → edit own task.
4. Login as staff → confirm only allowed fields writable on assigned task.
5. Login as admin → Import/refresh seed → confirm 18 BIR forms present.

### Prior art

The codebase is greenfield. There is no in-repo prior art to mirror. Tests should follow the patterns from the `plant-pwa` workspace in this same monorepo (Vitest + Testing Library + Firebase emulator for cloud calls).

## Out of Scope

- **Public-facing client portal** — clients do not log in. v1 is internal-only.
- **Email/SMS notifications** — the dashboard shows urgency, but does not push alerts. (Tracked as a follow-up.)
- **E-filing integration with eBIRForms or eFPS** — the system tracks filings but does not submit them. Uploads are manual file attachments.
- **Multi-currency / multi-jurisdiction** — Philippine BIR only.
- **Multi-tenant SaaS** — single firm per Firebase project (ADR-004). Onboarding a new customer means provisioning a new project.
- **Mobile app** — responsive web only.
- **Reporting & analytics dashboards** — summary cards only. Exportable reports are a follow-up.
- **Workflow automation beyond archive** — no automatic escalation rules, no reminders, no SLA timers.

## Further Notes

- **Reference decisions:** `docs/adr/ADR-001` (hybrid archive trigger), `ADR-002` (current-only materialization), `ADR-003` (algorithmic + holiday deadline calculator), `ADR-004` (single-tenant per project).
- **Open question for implement phase:** which 18 BIR forms get the most-thorough `deadline.ts` fixture coverage? Recommend focusing on the five highest-volume forms (2550Q, 2550M, 1601C, 1701Q, 1701A) for the first test pass, then expanding.
- **Region:** all Cloud Functions pinned to `asia-southeast1` to keep latency low for the firm's Iloilo-based operators and to keep holiday-table lookups co-located with the data.
- **Backups:** Firestore daily export to Cloud Storage (managed by Firebase) — schedule lives in the deploy notes, not in this PRD.
- **Browser support:** evergreen Chrome, Edge, Safari, Firefox. No IE / legacy Edge.