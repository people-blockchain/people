/**
 * Evidence run for the owner-approved audit-small batch (M05-7 sale payer field, M20-4 free
 * icon tier). Not part of the CI suite: it only captures screenshots.
 *
 *   PATH=/tmp/nodebin:$PATH npx playwright test --config playwright.audit-small.config.mjs
 */
/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: "./scripts",
  testMatch: ["audit-small-screenshots.spec.mjs"],
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  reporter: "list",
  use: {
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined,
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    viewport: { width: 1280, height: 720 },
    locale: "en-US",
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
