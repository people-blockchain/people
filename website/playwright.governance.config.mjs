/**
 * Evidence run for the /governance page. Not part of the CI suite: it only
 * captures screenshots, so it lives in its own config next to `founders-country`.
 *
 *   npx playwright test --config playwright.governance.config.mjs
 */
/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: "./scripts",
  testMatch: ["governance-screenshots.spec.mjs"],
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  reporter: "list",
  use: {
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined,
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
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
