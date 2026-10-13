// Playwright config for the LIVE end-to-end pass.
//
//   cd website && LIVE_E2E=1 E2E_WALLET_KEY_FILE=/workspace/secrets/people-e2e-wallet.key \
//     npx playwright test --config e2e/playwright.live.config.mjs
//
// Real transactions are broadcast at 1280px only; 360/390 re-walk the same
// screens up to (not including) the confirm step.

import { defineConfig } from "@playwright/test";

const baseURL = process.env.LIVE_BASE_URL ?? "https://www.peopleblockchain.network";

export default defineConfig({
  testDir: ".",
  testMatch: ["live-*.spec.mjs"],
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 25_000 },
  retries: 0,
  reporter: process.env.CI
    ? [["line"]]
    // Reporter paths resolve relative to this config's directory, not the cwd.
    : [["list"], ["json", { outputFile: ".live-playwright.json" }]],
  use: {
    baseURL,
    headless: true,
    browserName: "chromium",
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined,
    viewport: { width: 1280, height: 800 },
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "UTC",
    screenshot: "only-on-failure",
    video: "off",
    trace: "off",
  },
});
