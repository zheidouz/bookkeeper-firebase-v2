## Parent

Bookkeeper & Tax Filing Dashboard v1 — https://github.com/zheidouz/bookkeeper-firebase-v2/issues/1

## What to build

Admin-only user management: the "Users" sidebar page, the "Create user" form, the "Change role" action, and the two Cloud Functions (`adminCreateUser`, `assignRole`) that back them. After this slice, the firm admin can onboard their team without touching the Firebase console.

Specifically:

- Cloud Function `adminCreateUser({email, displayName, role})` — uses the Admin SDK to create the Auth account, sets a custom claim `{role}`, and writes `users/{uid}` with `{name, email, role, status: 'active', createdAt, updatedAt}`. Generates and returns a one-time set-password link via `generatePasswordResetLink`.
- Cloud Function `assignRole({uid, role})` — admin-only; sets the new custom claim and updates `users/{uid}.role` atomically. Returns the updated user document. UI forces the affected user to refresh their ID token (existing client helper) for the change to take effect on their next request.
- UI: `/users` page lists all `users/{uid}` rows with columns `name / email / role / status / created`. Per-row actions: "Change role" (Dialog with role select), "Disable" (sets `status: 'inactive'`).
- UI: "Create user" button opens a Dialog with `email`, `displayName`, `role` fields. On success, shows the password reset link in a Copy-to-clipboard card.
- `firestore.rules`: admin can read/write all `users/{uid}` documents. Authenticated non-admin can read their own document only. Bookkeeper/staff cannot list users.
- Tests: emulator-based happy path for both functions; a rule test that confirms a non-admin attempting to read another user's doc is denied.

## Acceptance criteria

- [ ] Admin can create a user from the UI; the password reset link appears in a copy-to-clipboard card; the new user appears in the list.
- [ ] Admin can change a user's role from the list; the change is reflected in `users/{uid}.role` and in the user's custom claim (verifiable in the emulator UI).
- [ ] Non-admin attempting to read another user's doc is denied by `firestore.rules` (test in the emulator suite).
- [ ] Bookkeeper and staff navigating to `/users` see a "Forbidden" empty state, not the list.
- [ ] A non-admin calling `adminCreateUser` or `assignRole` directly is denied by the callable's auth check.
- [ ] Form validation rejects missing email, malformed email, and missing role.
- [ ] Vitest covers the Zod schema validation; emulator tests cover the callable happy paths.

## Blocked by

- Auth shell (#3)
