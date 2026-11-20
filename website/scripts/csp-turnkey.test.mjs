import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "../next.config.ts";

function directiveTokens(policy, name) {
  const directive = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
  assert.ok(directive, `missing ${name}`);
  return directive.split(/\s+/).slice(1);
}

test("enforced CSP allows Turnkey API hosts", async () => {
  const entries = await nextConfig.headers();
  const page = entries.find(
    (entry) =>
      entry.source !== "/buy" &&
      entry.headers.some((header) => header.key === "Content-Security-Policy"),
  );
  assert.ok(page);
  const header = page.headers.find((h) => h.key === "Content-Security-Policy");
  const connect = directiveTokens(header.value, "connect-src");
  const frame = directiveTokens(header.value, "frame-src");
  assert.ok(connect.includes("https://api.turnkey.com"));
  assert.ok(connect.includes("https://*.turnkey.com"));
  assert.ok(frame.includes("https://import.turnkey.com"));
  assert.ok(frame.includes("https://export.turnkey.com"));
});
