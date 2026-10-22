import type { NextConfig } from "next";

/**
 * WEB-M3: a Content-Security-Policy is sent in *report-only* mode first, so a mis-scoped source
 * cannot break sign-in — it only produces console/`report-to` violations. This is the policy that
 * would be enforced once it has run clean; `'unsafe-inline'` covers the inline boot/JSON-LD scripts
 * today (a nonce would let it be dropped) and `'unsafe-eval'` is deliberately absent.
 *
 * Sources are the ones the app actually loads: Web3Auth (`*.web3auth.io`), MetaMask embedded
 * wallets, Google Identity Services (`accounts.google.com`, `apis.google.com`), the People node
 * RPC + explorer, Cloudflare Turnstile, WalletConnect's relay, Vercel's toolbar and YouTube embeds.
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://auth.web3auth.io https://*.web3auth.io https://*.metamask.io https://accounts.google.com https://apis.google.com https://vercel.live https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://va.vercel-scripts.com https://auth.web3auth.io https://*.web3auth.io https://*.metamask.io https://accounts.google.com https://apis.google.com https://node.peopleblockchain.network https://explorer.peopleblockchain.network https://*.peopleblockchain.network https://vercel.live https://challenges.cloudflare.com wss://relay.walletconnect.com https://*.walletconnect.com https://*.walletconnect.org https://li.quest https://*.li.fi",
  "frame-src 'self' https://auth.web3auth.io https://*.web3auth.io https://accounts.google.com https://vercel.live https://challenges.cloudflare.com https://www.youtube.com https://li.fi",
].join("; ");

const nextConfig: NextConfig = {
  // Baked in at build time so the bug-report button can attach an app version to its
  // auto-context. VERCEL_GIT_COMMIT_SHA is already set by Vercel; no dashboard env needed.
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
  },
  transpilePackages: [
    "@web3auth/modal",
    "@web3auth/base",
    "@web3auth/ethereum-provider",
    "@web3auth/no-modal",
    "@lifi/widget",
    "@lifi/widget-provider-ethereum",
    "@lifi/widget-provider-solana",
  ],
  async redirects() {
    const localeBuyRedirects = [
      "en",
      "ru",
      "es",
      "pt",
      "fr",
      "de",
      "it",
      "tr",
      "vi",
      "id",
      "zh",
      "ar",
    ].map((locale) => ({
      source: `/${locale}/buy`,
      destination: "/buy",
      permanent: false,
    }));
    return [
      { source: "/sign-in", destination: "/login", permanent: true },
      { source: "/partner/login", destination: "/login?callbackUrl=%2Fpartner", permanent: true },
      ...localeBuyRedirects,
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
          // recon.md R3 / wallet-sessions.md #6: standalone clickjacking protection, independent
          // of (and cheaper than) full CSP enforcement, which needs nonce infra first.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "X-Content-Type-Options", value: "nosniff" }],
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.peopleblockchain.network" },
      { protocol: "https", hostname: "peopleblockchain.network" },
      { protocol: "https", hostname: "**.vercel.app" },
      { protocol: "https", hostname: "ipfs.io" },
      { protocol: "https", hostname: "**.ipfs.dweb.link" },
      { protocol: "https", hostname: "**.ipfs.w3s.link" },
    ],
  },
  serverExternalPackages: ["solc"],
  outputFileTracingIncludes: {
    "/api/contracts/compile": ["./node_modules/solc/**/*", "./node_modules/@openzeppelin/contracts/**/*.sol"],
    "/litepaper": ["./src/content/litepaper/**/*.md"],
  }
};

export default nextConfig;
