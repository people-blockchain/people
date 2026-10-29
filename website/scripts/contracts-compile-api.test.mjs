import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./fixtures/contracts-compile-test-loader.mjs", import.meta.url);

const { resetRateLimitStoresForTests, setSharedRateLimitBackendForTests } = await import(
  "../src/lib/api-rate-limit.ts"
);
const { POST } = await import("../src/app/api/contracts/compile/route.ts");
const { CONTRACT_TEMPLATES } = await import("../src/lib/contract-templates.ts");
const { CONTRACT_COMPILE_RATE_PER_MIN, MAX_CONTRACT_SOURCE_BYTES } = await import(
  "../src/lib/contract-api-guards.ts"
);

const template = CONTRACT_TEMPLATES[0];

function post(body, headers = {}) {
  return POST(
    new Request("http://localhost/api/contracts/compile", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

const templateBody = () => ({
  source: template.source,
  fileName: template.fileName,
  templateId: template.id,
});

// In-memory only: the Postgres-backed store is covered by the shared limiter's own tests.
function reset() {
  setSharedRateLimitBackendForTests(null);
  resetRateLimitStoresForTests();
}

test("anonymous compile is rejected before any work", async () => {
  reset();
  globalThis.__compileTestSession = null;
  const res = await post(templateBody());
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, "sign_in_required");
});

test("signed-in user gets the precompiled artifact for a known template", async () => {
  reset();
  globalThis.__compileTestSession = { user: { id: "u-template" } };
  const res = await post(templateBody());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.bytecode, /^0x[0-9a-f]+$/i);
  assert.ok(Array.isArray(body.abi));
});

test("arbitrary source is refused even without the freeform flag", async () => {
  reset();
  globalThis.__compileTestSession = { user: { id: "u-arbitrary" } };
  const evil = "pragma solidity ^0.8.20; contract Evil { function f() external pure returns (uint256) { return 1; } }";
  const res = await post({ source: evil, fileName: "Evil.sol" });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "template_required");
});

test("modified template source with a valid template id is refused", async () => {
  reset();
  globalThis.__compileTestSession = { user: { id: "u-modified" } };
  const res = await post({ ...templateBody(), source: `${template.source}\n// tampered` });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "template_required");
});

test("freeform flag is disabled server-side", async () => {
  reset();
  globalThis.__compileTestSession = { user: { id: "u-freeform" } };
  const res = await post({ ...templateBody(), freeform: true });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "freeform_disabled");
});

test("oversized source is rejected with 413", async () => {
  reset();
  globalThis.__compileTestSession = { user: { id: "u-big" } };
  const source = "// " + "a".repeat(MAX_CONTRACT_SOURCE_BYTES + 10);
  const res = await post({ source, fileName: "Big.sol" });
  assert.equal(res.status, 413);
  assert.equal((await res.json()).error, "source_too_large");
});

test("per-user rate limit returns 429", async () => {
  reset();
  globalThis.__compileTestSession = { user: { id: "u-rate" } };
  for (let i = 0; i < CONTRACT_COMPILE_RATE_PER_MIN; i += 1) {
    assert.equal((await post(templateBody())).status, 200, `request ${i + 1}`);
  }
  const limited = await post(templateBody());
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error, "rate_limited");
});
