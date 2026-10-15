/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: "./scripts",
  testMatch: ["buy-page-screenshots.spec.mjs"],
  workers: 2,
  fullyParallel: true,
  timeout: 120_000,
  use: {
    baseURL: process.env.SHOT_BASE_URL ?? "http://127.0.0.1:3111",
    // Reveals finished and no mid-animation frames in the evidence shots.
    reducedMotion: "reduce",
  },
};

export default config;
