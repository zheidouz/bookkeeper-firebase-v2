## Parent

Bookkeeper & Tax Filing Dashboard v1 — https://github.com/zheidouz/bookkeeper-firebase-v2/issues/1

## What to build

The authentication shell: login page, logout button, protected route guard, and a top bar showing the current user's name and role. This is the smallest slice that demonstrates "an authorized user can use the app."

Specifically:

- `src/features/auth/` with: `LoginPage`, `LogoutButton`, `useAuth()` hook (returns `{user, role, status, signIn, signOut}`), `RequireAuth` route guard, and `<AppShell>` layout (sidebar placeholder + top bar + outlet).
- Firebase Auth SDK wired with email + password. Sign-in errors surface as inline form messages (not console-only).
- After login, redirect to `/` (dashboard placeholder). Unauthenticated access to any non-`/login` route redirects to `/login`.
- Top bar shows `displayName` and a colored role chip (`admin` / `bookkeeper` / `staff`). For now, every newly-created Firebase Auth user defaults to `staff` until #3 (`adminCreateUser`) is in place — the role read comes from `users/{uid}.role` with a fallback to the custom claim.
- `firestore.rules` is relaxed enough that any authenticated user can read `users/{own uid}` (their own profile). All other collections remain deny-all.
- `taskStatusHistory` collection is mentioned in the PRD but does not yet exist in schema; ignore it here.
- Vitest test for the `RequireAuth` redirect behavior; emulator-based test that proves the auth flow end-to-end (sign in with seeded admin → top bar shows admin chip).

## Acceptance criteria

- [ ] Unauthenticated visit to `/` redirects to `/login`.
- [ ] Logging in with a valid email + password lands on `/` and the top bar shows the user's name + role chip.
- [ ] Logging out from any page returns the user to `/login`.
- [ ] Invalid credentials show an inline error, not a console log.
- [ ] Direct visit to `/login` while authenticated redirects to `/`.
- [ ] Vitest suite covers `RequireAuth` redirect behavior in isolation (no Firebase).
- [ ] Emulator integration test: create a Firebase Auth user with a custom claim `role=admin`, run `useAuth()` against the emulator, assert the role chip renders "admin".
- [ ] Sidebar renders empty placeholder links for Dashboard / Clients / Tax Forms / Tasks / Archive / Users / Settings (the routes themselves 404 — that's expected; later slices fill them in).
- [ ] `firestore.rules` denies non-self reads on `users/{uid}` (admin override to come in #17).

## Blocked by

- Stack scaffold (#2)
