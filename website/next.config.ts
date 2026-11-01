import type { NextConfig } from "next";

/**
 * MF-14: the Content-Security-Policy is now ENFORCED (it was report-only under WEB-M3).
 *
 * Known gap: `script-src` still allows `'unsafe-inline'`. Next.js streams its RSC payload and the
 * root layout's theme boot script / JSON-LD as inline scripts, and dropping the keyword needs a
 * per-request nonce issued by the proxy on every route (the proxy matcher is currently limited to
 * auth and referral paths) plus dynamic rendering everywhere. That is a separate change; until it
 * lands, an HTML-injection bug can still run script. `'unsafe-eval'` stays absent, and
 * `object-src`, `base-uri`, `form-action` and `frame-ancestors` are locked down.
 *
 * Sources are the ones the app actually loads: Web3Auth (`*.web3auth.io`), MetaMask embedded
 * wallets, Google Identity Services (`accounts.google.com`, `apis.google.com`), the People node
 * RPC + explorer, Google Fonts (the Web3Auth modal stylesheet imports Inter), Base RPC (sale), Cloudflare Turnstile, WalletConnect's relay, LI.FI, Vercel's
 * toolbar and YouTube embeds.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://auth.web3auth.io https://*.web3auth.io https://*.metamask.io https://accounts.google.com https://apis.google.com https://vercel.live https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://auth.web3auth.io https://*.web3auth.io https://*.metamask.io https://accounts.google.com https://apis.google.com https://node.peopleblockchain.network https://explorer.peopleblockchain.network https://*.peopleblockchain.network https://mainnet.base.org https://vercel.live https://challenges.cloudflare.com wss://relay.walletconnect.com https://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.com wss://*.walletconnect.org https://li.quest https://*.li.fi",
  "frame-src 'self' https://auth.web3auth.io https://*.web3auth.io https://accounts.google.com https://vercel.live https://challenges.cloudflare.com https://www.youtube.com https://li.fi",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

/**
 * Camera is used by the wallet QR scanner (`getUserMedia`) and the clipboard by copy/paste buttons;
 * both are limited to this origin. Everything else the app never touches is denied.
 */
const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "autoplay=()",
  "bluetooth=()",
  "camera=(self)",
  "clipboard-read=(self)",
  "clipboard-write=(self)",
  "display-capture=()",
  "geolocation=()",
  "gyroscope=()",
  "hid=()",
  "magnetometer=()",
  "microphone=()",
  "payment=()",
  "serial=()",
  "usb=()",
].join(", ");

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
          { key: "Content-Security-Policy", value: CSP },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Legacy clickjacking fallback for browsers without CSP frame-ancestors; the site is not
          // embedded anywhere on purpose.
          { key: "X-Frame-Options", value: "DENY" },
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
