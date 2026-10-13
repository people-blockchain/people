/**
 * Evidence run for the /founders auto-claim change (PR #186). Not part of the CI suite:
 * it only captures screenshots, so it lives in its own config next to `evm-screenshots`.
 *
 *   PATH=/tmp/node22/bin:$PATH npx playwright test --config playwright.founders-auto-claim.config.mjs
 */
/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: "./scripts",
  testMatch: ["founders-auto-claim-screenshots.spec.mjs"],
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  reporter: "list",
  use: {
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined,
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    viewport: { width: 1280, height: 720 },
    locale: "en-US",
    // Sections fade in on scroll; a full-page shot would capture them still hidden.
    reducedMotion: "reduce",
  },
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: "npm run start",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: true,
        timeout: 120_000,
      },
};

export default config;
