import { test } from "node:test";
import assert from "node:assert/strict";
import { readErc20Meta, resolveTokenMeta, formatTokenSupply, shortAddress, cleanLabel } from "../src/lib/evm-token-meta.ts";
import { withTimeout, timeoutSignal, fetchJsonWithTimeout, TimeoutError } from "../src/lib/fetch-timeout.ts";

const ADDR = "0xD2DD2666990A77921e034F44Ec920D6b49390Ba9";

function fakeClient(answers) {
  return {
    async readContract({ functionName }) {
      const v = answers[functionName];
      if (v instanceof Error) throw v;
      if (typeof v === "function") return v();
      return v;
    },
  };
}

test("reads all four ERC-20 fields from the contract", async () => {
  const meta = await readErc20Meta(fakeClient({ name: "QA Pool Token", symbol: "QAPL", decimals: 6, totalSupply: BigInt(1_000_000_000_000) }), ADDR);
  assert.deepEqual(meta, { name: "QA Pool Token", symbol: "QAPL", decimals: 6, totalSupply: "1000000000000" });
  assert.equal(formatTokenSupply(meta.totalSupply, meta.decimals), "1,000,000");
});

test("a reverting name()/symbol() does not blank the other fields", async () => {
  const meta = await readErc20Meta(fakeClient({ name: new Error("revert"), symbol: new Error("bytes32"), decimals: 18, totalSupply: BigInt(5) * BigInt(10) ** BigInt(17) }), ADDR);
  assert.equal(meta.name, null);
  assert.equal(meta.symbol, null);
  assert.equal(meta.decimals, 18);
  assert.equal(formatTokenSupply(meta.totalSupply, meta.decimals), "0.5");
});

test("a hanging call is cut by the per-call timeout and never blocks the others", async () => {
  const never = () => new Promise(() => {});
  const started = Date.now();
  const meta = await readErc20Meta(fakeClient({ name: never, symbol: "X", decimals: 0, totalSupply: BigInt(7) }), ADDR, 40);
  assert.ok(Date.now() - started < 1000);
  assert.deepEqual(meta, { name: null, symbol: "X", decimals: 0, totalSupply: "7" });
});

test("resolution order: contract, then catalog, then short address with unknown supply", () => {
  const contract = { name: "Chain Name", symbol: "CHN", decimals: 6, totalSupply: "2500000" };
  const catalog = { name: "Catalog Name", symbol: "CAT", decimals: 2, totalSupply: 9 };
  const a = resolveTokenMeta({ assetId: ADDR, contract, catalog });
  assert.deepEqual([a.name, a.symbol, a.decimals, a.supplyText, a.catalogSupply, a.source], ["Chain Name", "CHN", 6, "2.5", null, "contract"]);

  const b = resolveTokenMeta({ assetId: ADDR, contract: null, catalog });
  assert.deepEqual([b.name, b.symbol, b.decimals, b.supplyText, b.catalogSupply, b.source], ["Catalog Name", "CAT", 2, null, 9, "catalog"]);

  const partial = resolveTokenMeta({ assetId: ADDR, contract: { name: null, symbol: null, decimals: 6, totalSupply: "1" }, catalog });
  assert.deepEqual([partial.name, partial.symbol], ["Catalog Name", "CAT"]);

  const c = resolveTokenMeta({ assetId: ADDR, contract: { name: null, symbol: null, decimals: null, totalSupply: null }, catalog: null });
  assert.equal(c.name, "0xD2DD…0Ba9");
  assert.equal(c.symbol, "0xD2DD…0Ba9");
  assert.equal(c.supplyText, null);
  assert.equal(c.catalogSupply, null);
  assert.equal(c.source, "address");
  assert.equal(resolveTokenMeta({ assetId: ADDR, contract: null, catalog: null }).source, "address");
});

test("supply is unknown (not 0) when decimals are unknown; zero supply stays 0", () => {
  assert.equal(formatTokenSupply("1000", null), null);
  assert.equal(formatTokenSupply(null, 6), null);
  assert.equal(formatTokenSupply("not a number", 6), null);
  assert.equal(formatTokenSupply("0", 6), "0");
  assert.equal(formatTokenSupply("1", 6), "0.000001");
  assert.equal(formatTokenSupply("123456789", 0), "123,456,789");
  const r = resolveTokenMeta({ assetId: ADDR, contract: { name: "N", symbol: "S", decimals: null, totalSupply: "1000" }, catalog: null });
  assert.equal(r.supplyText, null);
});

test("labels from contracts are bounded and stripped of control characters", () => {
  assert.equal(cleanLabel("  A\u0000B‮  "), "AB");
  assert.equal(cleanLabel("x".repeat(500)).length, 64);
  assert.equal(cleanLabel(""), null);
  assert.equal(cleanLabel(123), null);
  assert.equal(shortAddress("abc"), "abc");
});

test("withTimeout rejects with TimeoutError and passes results through", async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 20), TimeoutError);
  assert.equal(await withTimeout(Promise.resolve(5), 1000), 5);
  await assert.rejects(withTimeout(() => Promise.reject(new Error("boom")), 1000), /boom/);
});

test("timeoutSignal aborts on deadline and on parent abort", async () => {
  const s = timeoutSignal(20);
  await new Promise(resolve => s.addEventListener("abort", resolve));
  assert.ok(s.aborted);
  const parent = new AbortController();
  const child = timeoutSignal(10_000, parent.signal);
  parent.abort();
  assert.ok(child.aborted);
});

test("fetchJsonWithTimeout never hangs, even when the body stalls, and rejects non-2xx", async () => {
  const hanging = (_url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
  await assert.rejects(fetchJsonWithTimeout("/x", { timeoutMs: 30, fetchImpl: hanging }), TimeoutError);
  const stalledBody = async () => ({ ok: true, json: () => new Promise(() => {}) });
  await assert.rejects(fetchJsonWithTimeout("/x", { timeoutMs: 30, fetchImpl: stalledBody }), TimeoutError);
  const bad = async () => ({ ok: false, status: 502, json: async () => ({}) });
  await assert.rejects(fetchJsonWithTimeout("/x", { fetchImpl: bad }), /http_502/);
  const good = async () => ({ ok: true, json: async () => ({ a: 1 }) });
  assert.deepEqual(await fetchJsonWithTimeout("/x", { fetchImpl: good }), { a: 1 });
});
