import { defineConfig, devices } from "@playwright/test";

/**
 * Browser-level end-to-end tests (audit item 9.C).
 *
 * SCOPE, STATED HONESTLY. These cover the journeys that need no credentials:
 * the public surface, form validation, the age gate, keyboard operability and
 * accessible naming. They deliberately do NOT cover purchase, settlement or
 * withdrawal — that chain needs Stripe test-mode keys and a seeded funded
 * account, and pretending to cover it with mocks would retire a risk that is
 * still live. That run remains audit item BE-10.
 *
 * Points at a running deployment rather than booting one, so the same suite
 * works against local dev, a Vercel preview, or production:
 *
 *   E2E_BASE_URL=https://sports-pool.vercel.app npm run test:browser
 *
 * With no E2E_BASE_URL it targets localhost:3000 and starts `next dev` itself.
 */

const BASE = process.env.E2E_BASE_URL?.trim().replace(/\/$/, "");

/**
 * Run against a Chromium already on the machine instead of Playwright's own
 * download. Needed in sandboxes and locked-down CI images where the bundled
 * browser cannot be fetched, and where the installed build number will not
 * match what this Playwright version expects.
 *
 *   CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
 *
 * Unset (the normal case) this is an empty object and nothing changes.
 */
const chromiumPath = process.env.CHROMIUM_EXECUTABLE_PATH?.trim();
const launchOverride = chromiumPath
  ? { launchOptions: { executablePath: chromiumPath } }
  : {};

export default defineConfig({
  testDir: "./tests/browser",
  // A slow cold start on a serverless preview should not read as a failure.
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // Never let a stray .only silently shrink the suite in CI.
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL: BASE || "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], ...launchOverride } },
    // The product is played on a phone during games; layout regressions there
    // are not hypothetical. mobile-layout.spec.ts runs only in this project.
    { name: "mobile-chromium", use: { ...devices["Pixel 7"], ...launchOverride } },
  ],

  // Only boot a server when no deployment was named.
  webServer: BASE
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
