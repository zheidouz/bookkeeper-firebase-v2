## Parent

Bookkeeper & Tax Filing Dashboard v1 — https://github.com/zheidouz/bookkeeper-firebase-v2/issues/1

## What to build

Client management: the `/clients` page, full CRUD on the `clients` collection, search, pagination, and the per-client detail view showing attached forms (the attached-forms list renders empty here; #7 fills it).

Specifically:

- Schema for `clients/{clientId}` exactly as in the PRD: `{businessName, ownerName, tin, rdo, address, contactNumber, email, assignedBookkeeperId, status, notes, createdAt, updatedAt}`. `status` enum: `'active' | 'inactive' | 'archived'`.
- UI: `/clients` page with searchable, paginated Table. Columns: `businessName / ownerName / tin / rdo / assignedBookkeeper / status`. Search across `businessName`, `ownerName`, `tin`. Per-row actions: View, Edit, Archive (soft — sets `status: 'archived'`).
- "New client" Dialog (RHF + Zod) — `assignedBookkeeperId` is a Select populated from `users/{uid}` where `role == 'bookkeeper'`.
- `/clients/{clientId}` detail page shows the client's full record (read-only fields summary + edit button) and a placeholder section "Attached forms" (empty state, populated by #7).
- `firestore.rules`: all authenticated roles can read `clients`; bookkeeper+admin can create/update; admin can archive (status change) and hard-delete; archived rows remain readable by all roles, writable by admin only.
- Reuse the same RHF+Zod schema on the client side and in a small `validateClient` helper in Cloud Functions (used in #7 when attaching forms).

## Acceptance criteria

- [ ] Creating a new client from the UI persists to Firestore with all 11 fields.
- [ ] Search by `tin` ("123-456-789") finds the client.
- [ ] Pagination works at 25 rows per page.
- [ ] Archiving a client removes them from the default active list but they remain visible in a "Show archived" toggle.
- [ ] Editing `assignedBookkeeperId` updates the field and re-renders the row.
- [ ] Non-bookkeeper/non-admin attempting `clients.create()` is denied.
- [ ] Vitest covers the Zod schema. Emulator tests cover the rules.

## Blocked by

- Auth shell (#3)
- User management (#5)
