import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { loadedBaselineAddresses } from "../src/lib/evm/chain-catalog.ts";

const CONTRACT_RE = /^0x[0-9a-fA-F]{40}$/;

test("committed catalog snapshot uses contract and the loader reads it", () => {
  const snapshot = JSON.parse(
    readFileSync(new URL("../src/data/evm-token-catalog.json", import.meta.url), "utf8"),
  );
  assert.ok(Array.isArray(snapshot.tokens) && snapshot.tokens.length > 0);
  for (const row of snapshot.tokens) {
    assert.match(row.contract, CONTRACT_RE);
    assert.equal(Object.hasOwn(row, "tokenAddress"), false);
  }
  const loaded = loadedBaselineAddresses().map((address) => address.toLowerCase()).sort();
  const contracts = snapshot.tokens.map((row) => String(row.contract).toLowerCase()).sort();
  assert.deepEqual(loaded, contracts);
});
