/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: "./scripts",
  testMatch: ["founders-landing-screenshots.spec.mjs"],
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 390, height: 844 },
  },
};

export default config;
