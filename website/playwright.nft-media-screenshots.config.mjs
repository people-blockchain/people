import { randomBytes } from "node:crypto";

// Browser checks and evidence screenshots for /create/nft. Wallet, chain RPC and storage are
// mocked in the specs; the app itself runs from a production build with live RPC blocked.
const base = process.env.SHOT_BASE_URL ?? "http://localhost:3111";

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: "./scripts",
  testMatch: ["nft-media-flow.spec.mjs", "nft-media-screenshots.spec.mjs"],
  workers: 2,
  fullyParallel: true,
  timeout: 120_000,
  use: {
    baseURL: base,
    // Reveals finished states and no mid-animation frames in the evidence shots.
    reducedMotion: "reduce",
    launchOptions: { args: ["--autoplay-policy=document-user-activation-required"] },
  },
  webServer: process.env.SHOT_BASE_URL
    ? undefined
    : {
        command: "npx next start -p 3111",
        url: base,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          EVM_RPC_URL: "http://127.0.0.1:9",
          AUTH_SECRET: process.env.AUTH_SECRET || randomBytes(32).toString("hex"),
          NO_LIVE_RPC_MODE: "block",
          NODE_OPTIONS: [process.env.NODE_OPTIONS, "--import=./scripts/no-live-rpc.mjs"].filter(Boolean).join(" "),
        },
      },
};

export default config;
