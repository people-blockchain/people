import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const guard = fileURLToPath(new URL("./no-live-rpc.mjs", import.meta.url));

function runWithGuard(source, env = {}) {
  return spawnSync(process.execPath, ["--import", guard, "--input-type=module", "-e", source], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    timeout: 20_000,
  });
}

test("the guard is active in this test process (loaded via node-test-paths.mjs)", () => {
  // Not exercised in-process: a blocked call would (correctly) fail this whole file.
  assert.equal(globalThis.fetch.name, "guardedFetch");
});

test("a swallowed call to the public PEOPLE RPC still fails the process", () => {
  const run = runWithGuard(
    `await fetch("https://node.peopleblockchain.network/rpc").catch(() => {}); console.log("swallowed");`,
  );
  assert.match(run.stdout, /swallowed/);
  assert.match(run.stderr, /no-live-rpc/);
  assert.equal(run.status, 1);
});

test("the validator IP is blocked too, including WebSocket", () => {
  const run = runWithGuard(
    `try { new WebSocket("ws://147.45.227.204:8546"); } catch (e) { console.log(String(e.message).includes("no-live-rpc")); }`,
  );
  assert.match(run.stdout, /true/);
  assert.equal(run.status, 1);
});

test("block mode rejects the call but leaves the exit code alone", () => {
  const run = runWithGuard(
    `const r = await fetch("https://node.peopleblockchain.network/rpc").then(() => "sent", () => "blocked"); console.log(r);`,
    { NO_LIVE_RPC_MODE: "block" },
  );
  assert.match(run.stdout, /blocked/);
  assert.equal(run.status, 0);
});

test("other hosts are untouched", () => {
  const run = runWithGuard(`await fetch("http://127.0.0.1:9").catch(() => {}); console.log("ok");`);
  assert.match(run.stdout, /ok/);
  assert.equal(run.status, 0);
});
