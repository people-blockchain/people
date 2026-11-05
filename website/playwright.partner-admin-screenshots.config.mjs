/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: "./scripts",
  testMatch: ["partner-admin-screenshots.spec.mjs"],
  workers: 1,
  timeout: 120_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3456",
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  },
};

export default config;
