/**
 * Enforced CSP on normal pages must allow Web3Auth websockets by host.
 * The `/buy` rule is the only one that may open bare `https:` / `wss:`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "../next.config.ts";

function connectSrcTokens(policy) {
  const directive = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === "connect-src" || part.startsWith("connect-src "));
  assert.ok(directive, "missing connect-src");
  return directive.split(/\s+/).slice(1);
}

test("enforced page CSP connect-src allows Web3Auth wss without a bare scheme", async () => {
  const entries = await nextConfig.headers();
  const page = entries.find(
    (entry) =>
      entry.source !== "/buy" &&
      entry.headers.some((header) => header.key === "Content-Security-Policy"),
  );
  assert.ok(page, "expected an enforced CSP rule for normal pages");

  const header = page.headers.find((h) => h.key === "Content-Security-Policy");
  const tokens = connectSrcTokens(header.value);

  assert.ok(tokens.includes("wss://*.web3auth.io"));
  assert.equal(tokens.includes("wss:"), false);
  assert.equal(tokens.includes("*"), false);
  assert.equal(tokens.includes("https:"), false);
});
