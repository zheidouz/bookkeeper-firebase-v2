// playwright.config.ts — slice #18.
//
// One-file config: smoke-level e2e runs the dashboard demo at a
// 375px-wide viewport to prove the mobile layout works.
//
// To run locally:
//   1. Start the emulator suite + vite dev server in two terminals:
//      npm run emulators        # auth/firestore/storage on 4000/5000/etc
//      npm run dev              # vite preview against the emulators
//   2. Install the browser (first time only):
//      npx playwright install chromium
//   3. Run:
//      npm run test:e2e
//
// The 5-path critical-e2e suite called out in the issue brief is
// out of scope for slice #18 (see PR description) — too fragile to
// ship as a single CI gate without a real Vitest-emulator bridge.
// This config is the foundation; future slices can extend it.

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // Don't open a browser every time `npm run test:e2e` is invoked
  // in CI — we want a single deterministic report.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  // The emulator + vite server are started out of band (see README).
  // The webServer block below runs them for local dev only.
  reporter: [["list"]],
  use: {
    baseURL: process.env.PW_BASE_URL ?? "http://127.0.0.1:5000",
    // 375px-wide viewport is the iPhone SE / iPhone 12 mini width
    // — the brief's responsive target.
    viewport: { width: 375, height: 812 },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-mobile",
      use: { ...devices["iPhone SE"] },
    },
  ],
  webServer: process.env.PW_SKIP_WEBSERVER
    ? undefined
    : {
        command: "VITE_USE_EMULATOR=true npm run dev",
        url: "http://127.0.0.1:5000",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
