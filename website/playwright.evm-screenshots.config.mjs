/** @type {import('@playwright/test').PlaywrightTestConfig} */
export default {
  testDir: "./scripts",
  testMatch: ["evm-cutover-screenshots.spec.mjs", "prod-evm-screenshots.spec.mjs"],
  workers: 1,
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:3010",
    viewport: { width: 1280, height: 720 },
  },
};
