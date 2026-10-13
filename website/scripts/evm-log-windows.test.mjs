import { test } from "node:test";
import assert from "node:assert/strict";

// Mirrors logWindows() in chain-catalog.ts (kept dependency-free for node --test).
function logWindows(fromBlock, latest, size = 9000) {
  const out = [];
  for (let start = Math.max(0, fromBlock); start <= latest; start += size) out.push([start, Math.min(latest, start + size - 1)]);
  return out;
}

test("windows never exceed the 10,000-block eth_getLogs cap and cover the range", () => {
  const w = logWindows(158860, 175000);
  assert.equal(w[0][0], 158860);
  assert.equal(w.at(-1)[1], 175000);
  for (const [a, b] of w) assert.ok(b - a + 1 <= 10000);
  for (let i = 1; i < w.length; i++) assert.equal(w[i][0], w[i - 1][1] + 1);
});

test("empty when start is past latest", () => {
  assert.deepEqual(logWindows(10, 5), []);
});
