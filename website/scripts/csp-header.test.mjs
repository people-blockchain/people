/**
 * WEB-M3 — HTML responses must carry a Content-Security-Policy in *report-only* mode: present so
 * violations are observable, report-only so a mis-scoped source cannot break sign-in, and scoped
 * to the hosts the app actually talks to (Web3Auth, MetaMask, Google, the People node, Turnstile,
 * WalletConnect, vercel.live).
 */
import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "../next.config.ts";

test("next.config emits a Content-Security-Policy-Report-Only header for pages", async () => {
  const entries = await nextConfig.headers();
  const withCsp = entries.filter((entry) =>
    entry.headers.some((h) => h.key === "Content-Security-Policy-Report-Only"),
  );
  assert.equal(withCsp.length, 1, "expected exactly one CSP header rule");

  const header = withCsp[0].headers.find((h) => h.key === "Content-Security-Policy-Report-Only");
  assert.ok(header.value.length > 0);
  // Report-only: the enforced key must not be set, or a bad policy would block resources now.
  const enforcing = entries.flatMap((e) => e.headers).filter((h) => h.key === "Content-Security-Policy");
  assert.equal(enforcing.length, 0, "CSP must not be enforced yet");
});

test("the CSP allowlist covers the required sources and defaults to self", async () => {
  const entries = await nextConfig.headers();
  const policy = entries
    .flatMap((e) => e.headers)
    .find((h) => h.key === "Content-Security-Policy-Report-Only").value;

  for (const directive of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'self'"]) {
    assert.ok(policy.includes(directive), `missing ${directive}`);
  }
  for (const source of [
    "'self'",
    "https://auth.web3auth.io",
    "https://*.web3auth.io",
    "https://*.metamask.io",
    "https://accounts.google.com",
    "https://apis.google.com",
    "https://node.peopleblockchain.network",
    "https://explorer.peopleblockchain.network",
    "https://vercel.live",
  ]) {
    assert.ok(policy.includes(source), `missing ${source}`);
  }
});
