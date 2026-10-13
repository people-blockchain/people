/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: "./scripts",
  testMatch: ["warm-redesign-screenshots.spec.mjs"],
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 1280, height: 900 },
  },
};

export default config;
