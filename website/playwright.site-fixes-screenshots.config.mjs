/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: "./scripts",
  testMatch: ["site-fixes-screenshots.spec.mjs"],
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 1280, height: 900 },
    // Evidence shots must show the settled page: reveals finished, count-ups at
    // their final figures, the phone mock stacked instead of mid-loop.
    reducedMotion: "reduce",
  },
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: "npm run start",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: true,
        timeout: 180_000,
      },
};

export default config;
