// tests/e2e/smoke.spec.ts — slice #18.
//
// The single critical happy-path e2e the brief allows in this slice:
// the user is bounced to /login when unauthenticated, the sidebar
// renders on a 375px-wide viewport, and the mobile drawer toggle is
// present. Full 5-path suite is intentionally out of scope (see the
// PR description).
//
// How to run:
//   1. `npm run emulators`                    (one terminal)
//   2. `VITE_USE_EMULATOR=true npm run dev`   (another)
//   3. `npx playwright install chromium`      (first time only)
//   4. `npm run test:e2e`

import { test, expect } from "@playwright/test";

test.describe("smoke — slice #18", () => {
  test("landing on / bounces to /login when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("button", { name: /sign in/i }),
    ).toBeVisible();
  });

  test("login screen renders the sign-in form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("body")).toBeVisible();
    const loginHeading = await page
      .getByRole("heading", { name: /sign in/i })
      .or(page.getByText(/sign in/i));
    await expect(loginHeading.first()).toBeVisible();
  });

  test("mobile sidebar toggle is mounted", async ({ page }) => {
    // The sidebar is part of the login screen's chrome so the
    // hamburger toggle is reachable without auth.
    await page.goto("/login");
    const toggle = page.getByTestId("sidebar-toggle");
    await expect(toggle).toBeVisible();
  });
});
