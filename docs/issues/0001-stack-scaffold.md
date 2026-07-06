## Parent

Bookkeeper & Tax Filing Dashboard v1 — https://github.com/zheidouz/bookkeeper-firebase-v2/issues/1

## What to build

The deployable foundation: a Vite + React 18 + TypeScript SPA on Firebase Hosting, with the local-dev surface wired to the Firebase Emulator Suite. This slice produces no user-visible feature yet — it makes every later slice possible.

Specifically:

- Vite scaffold (TypeScript strict, Tailwind CSS, shadcn/ui initialized with the primitives listed in the PRD: Button, Card, Dialog, Dropdown, Form, Input, Select, Table, Toast, Tooltip).
- `firebase.json`, `firestore.rules` (placeholder), `firestore.indexes.json` (empty), `firebase.json` Hosting target.
- `firebaseConfig.ts` that reads `VITE_USE_EMULATOR=true` to point the SDK at the local emulator; otherwise reads from env.
- Cloud Functions v2 (Node 20, `asia-southeast1`) initialized under `functions/src/` with `package.json`, `tsconfig.json`, and an empty `index.ts` exporting `{}`.
- `package.json` scripts: `dev` (concurrently: emulators + vite), `build`, `deploy`, `test`, `test:e2e`, `emulators`.
- `.firebaserc` with a placeholder project alias; README updated with the local-dev quickstart.
- One empty `<App />` route at `/` rendering a "Bootstrapped" card so we can verify the bundle deploys and renders.

No auth, no Firestore reads, no routes. Just the shell that deploys.

## Acceptance criteria

- [ ] `npm install` succeeds in the project root and in `functions/`.
- [ ] `npm run dev` starts the Firebase emulator suite (Auth :9099, Firestore :8080, Functions :5001, Hosting :5000) and Vite (:5173) concurrently; both come up without errors.
- [ ] Visiting `http://localhost:5173/` renders the "Bootstrapped" card from the SPA, which is served through the Hosting emulator on :5000.
- [ ] `npm run build` produces a deployable `dist/` and `firebase deploy --only hosting,firestore,functions` against the emulators succeeds (no live Firebase project required for this slice).
- [ ] Tailwind utility classes work (e.g., a `bg-emerald-500` div renders green in the emulator-served page).
- [ ] shadcn/ui primitives are in `src/components/ui/` and importable from `@/components/ui/button`.
- [ ] `firestore.rules` is a placeholder that denies all reads/writes (locked-down default; later slices relax it).
- [ ] `firebase emulators:start --export-on-exit=./firebase-emulators-data` round-trips without error.
- [ ] README's "Local dev" section accurately describes the `npm run dev` workflow.

## Blocked by

None — can start immediately.
