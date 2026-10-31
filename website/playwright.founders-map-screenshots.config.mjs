/** @type {import('@playwright/test').PlaywrightTestConfig} */
const PORT = process.env.PORT ?? "3517";
if (PORT === "3000") {
  throw new Error("founders map screenshots must not use port 3000; set PORT (default 3517)");
}

const config = {
  testDir: "./scripts",
  testMatch: ["founders-map-screenshots.spec.mjs"],
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  webServer: process.env.SHOT_BASE_URL
    ? undefined
    : {
        command: `npm run start -- -p ${PORT}`,
        url: `http://127.0.0.1:${PORT}`,
        reuseExistingServer: true,
        timeout: 180_000,
        env: { ...process.env, PORT },
      },
  use: {
    baseURL: process.env.SHOT_BASE_URL ?? `http://127.0.0.1:${PORT}`,
    viewport: { width: 390, height: 844 },
  },
};

export default config;
