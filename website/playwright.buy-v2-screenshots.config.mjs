/** @type {import('@playwright/test').PlaywrightTestConfig} */
const PORT = process.env.PORT ?? "3456";

if (PORT === "3000") {
  throw new Error("buy-v2 screenshots must not use port 3000; set PORT to a free port (default 3456)");
}

const config = {
  testDir: "./scripts",
  testMatch: ["buy-v2-screenshots.spec.mjs"],
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  use: {
    baseURL: process.env.SHOT_BASE_URL ?? `http://127.0.0.1:${PORT}`,
    reducedMotion: "reduce",
  },
  webServer: {
    command: "npm run start -- -p $PORT",
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      PORT,
      NEXT_PUBLIC_PPL_V2_BUY_ENABLED: "1",
      NEXT_PUBLIC_PPL_V2_BUY_PREVIEW: "1",
      NEXT_PUBLIC_PPL_V2_HUB_ADDRESS: "0x1111111111111111111111111111111111111111",
      NEXT_PUBLIC_PPL_V2_CHAIN_ID: "8453",
    },
  },
};

export default config;
