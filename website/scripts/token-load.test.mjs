import { test } from "node:test";
import assert from "node:assert/strict";
import { LoadTimeoutError, loadAccounts, loadTokenPage, withTimeout } from "../src/lib/explorer/token-load.ts";

const never = () => new Promise(() => {});

function collect(extra = {}) {
  const events = [];
  const options = {
    fetchAsset: async () => ({ id: "t", createdAt: 7 }),
    fetchAccounts: async () => [1, 2],
    fetchTimestamp: async () => 1700000000000,
    needsTimestamp: (asset) => asset.createdAt !== undefined,
    timeoutMs: { asset: 200, accounts: 200, timestamp: 200 },
    onAsset: (asset) => events.push(["asset", asset.id]),
    onAssetFailed: () => events.push(["assetFailed"]),
    onAccounts: (result) => events.push(["accounts", result.ok]),
    onTimestamp: (ts) => events.push(["timestamp", ts]),
    ...extra,
  };
  return { events, options };
}

test("asset is delivered while accounts never resolves; accounts then fail after the timeout", async () => {
  const { events, options } = collect({ fetchAccounts: never, timeoutMs: { asset: 200, accounts: 30, timestamp: 200 } });
  await loadTokenPage(options);
  assert.deepEqual(events.slice(0, 1), [["asset", "t"]]);
  assert.deepEqual(events.find((e) => e[0] === "accounts"), ["accounts", false]);
  assert.ok(events.findIndex((e) => e[0] === "asset") < events.findIndex((e) => e[0] === "accounts"));
});

test("happy path delivers asset, accounts and timestamp", async () => {
  const { events, options } = collect();
  await loadTokenPage(options);
  assert.deepEqual(events.map((e) => e[0]).sort(), ["accounts", "asset", "timestamp"]);
  assert.deepEqual(events.find((e) => e[0] === "timestamp"), ["timestamp", 1700000000000]);
});

test("a hanging timestamp never blocks asset or accounts and ends as unavailable", async () => {
  const { events, options } = collect({ fetchTimestamp: never, timeoutMs: { asset: 200, accounts: 200, timestamp: 20 } });
  await loadTokenPage(options);
  assert.deepEqual(events.find((e) => e[0] === "timestamp"), ["timestamp", null]);
  assert.ok(events.some((e) => e[0] === "asset") && events.some((e) => e[0] === "accounts"));
});

test("asset failure and asset timeout both settle as assetFailed", async () => {
  for (const fetchAsset of [async () => { throw new Error("boom"); }, never]) {
    const { events, options } = collect({ fetchAsset, timeoutMs: { asset: 20, accounts: 20, timestamp: 20 } });
    await loadTokenPage(options);
    assert.deepEqual(events.filter((e) => e[0] === "asset" || e[0] === "assetFailed"), [["assetFailed"]]);
  }
});

test("an accounts failure does not touch the asset", async () => {
  const { events, options } = collect({ fetchAccounts: async () => { throw new Error("http_502"); } });
  await loadTokenPage(options);
  assert.deepEqual(events.find((e) => e[0] === "accounts"), ["accounts", false]);
  assert.ok(events.some((e) => e[0] === "asset"));
});

test("a genesis asset without createdAt skips the timestamp request", async () => {
  let asked = false;
  const { events, options } = collect({ fetchAsset: async () => ({ id: "g" }), fetchTimestamp: async () => { asked = true; return 1; } });
  await loadTokenPage(options);
  assert.equal(asked, false);
  assert.ok(!events.some((e) => e[0] === "timestamp"));
});

test("an aborted signal suppresses every callback", async () => {
  const controller = new AbortController();
  const { events, options } = collect({ signal: controller.signal, fetchAsset: async () => { controller.abort(); return { id: "x" }; } });
  await loadTokenPage(options);
  assert.deepEqual(events, []);
});

test("withTimeout aborts the signal and rejects even if the work ignores it", async () => {
  let signalSeen;
  await assert.rejects(withTimeout((signal) => { signalSeen = signal; return never(); }, 20), LoadTimeoutError);
  assert.equal(signalSeen.aborted, true);
  assert.deepEqual(await loadAccounts(never, 20), { ok: false });
  assert.deepEqual(await loadAccounts(async () => null, 20), { ok: false });
  assert.deepEqual(await loadAccounts(async () => [1], 20), { ok: true, value: [1] });
});
