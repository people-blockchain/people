import { randomBytes } from "node:crypto";

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: "./scripts",
  testMatch: [
    // /predict is behind NEXT_PUBLIC_FEATURE_PREDICT (off by default, 404 otherwise).
    ...(process.env.NEXT_PUBLIC_FEATURE_PREDICT === "1" ? ["predict.spec.mjs"] : []),
    "hero-headline-layout.spec.mjs",
    "no-horizontal-overflow.spec.mjs",
    "header-mobile-slogan.spec.mjs",
    "header-desktop-layout.spec.mjs",
    "header-mobile-layout.spec.mjs",
    "header-wordmark-match.spec.mjs",
    "header-lockup-single-render.spec.mjs",
    "web3auth-connect-click.spec.mjs",
    "tokenomics-hiw-mobile-layout.spec.mjs",
    "founders-mobile-layout.spec.mjs",
    "partner-login-click.spec.mjs",
    "header-logo-theme.spec.mjs",
    "network-status.spec.mjs",
    "explorer-live.spec.mjs",
    "favicon-assets.spec.mjs",
    "wallet-ux.spec.mjs",
    "wallet-session-persist.spec.mjs",
    "wallet-connect-modal.spec.mjs",
    "wallet-mobile-connect.spec.mjs",
    "injected-wallet-connect.spec.mjs",
    "wallet-sign-in-loading.spec.mjs",
    "header-wallet-rehydrate.spec.mjs",
    "wallet-google-primary.spec.mjs",
    "roadmap-agents-screenshots.spec.mjs",
    "bug-button.spec.mjs",
    "wallet-keep-current.spec.mjs",
  ],
  fullyParallel: false,
  workers: 1,
  // Real specs finish in seconds; a stuck locator should fail fast instead of
  // eating the CI job budget (20+ min cancels with no report).
  timeout: 60_000,
  // A broken build fails dozens of specs; stop early so CI reports red with
  // details instead of being cancelled by the job timeout.
  maxFailures: process.env.CI ? 10 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  use: {
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined,
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    viewport: { width: 1280, height: 720 },
    locale: "en-US",
    // Tests must never reach the public PEOPLE node (it is the production validator's RPC):
    // the browser cannot resolve it, so specs have to mock it with `page.route`.
    launchOptions: {
      args: ["--host-resolver-rules=MAP node.peopleblockchain.network ~NOTFOUND, MAP 147.45.227.204 ~NOTFOUND"],
    },
  },
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: "npm run start",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        // Server-side RPC goes to a closed local port, and scripts/no-live-rpc.mjs rejects any
        // hard-coded call to the public PEOPLE node.
        env: {
          EVM_RPC_URL: "http://127.0.0.1:9",
          // `next start` refuses to run without AUTH_SECRET; a throwaway per-run value for the local
          // test server (never a real secret, never committed).
          AUTH_SECRET: process.env.AUTH_SECRET || randomBytes(32).toString("hex"),
          NO_LIVE_RPC_MODE: "block",
          NODE_OPTIONS: [process.env.NODE_OPTIONS, "--import=./scripts/no-live-rpc.mjs"].filter(Boolean).join(" "),
        },
      },
};

export default config;
