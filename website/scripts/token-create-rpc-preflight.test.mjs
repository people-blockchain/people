import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { pinAfterCreatePreflight, preflightTokenCreateRpc } from "../src/lib/factory/token-create-preflight.ts";

const PAYER = "0x0000000000000000000000000000000000000001";
const sleep = async () => {};

test("RPC preflight failure does not pin", async () => {
  let pins = 0;
  let balances = 0;
  await assert.rejects(
    () => pinAfterCreatePreflight(
      () => preflightTokenCreateRpc({
        expectedChainId: 97401,
        payer: PAYER,
        sleep,
        client: {
          getChainId: async () => {
            throw new Error("HTTP request failed. Status: 503");
          },
          getBalance: async () => {
            balances += 1;
            return 1n;
          },
          simulateCreate: async () => ({ ok: true }),
        },
      }),
      async () => {
        pins += 1;
        return "ipfs://cid/metadata.json";
      },
    ),
  );
  assert.equal(pins, 0);
  assert.equal(balances, 0);
});

test("a transient 503 then success pins exactly once", async () => {
  let chainCalls = 0;
  let pins = 0;
  const order = [];
  const uri = await pinAfterCreatePreflight(
    () => preflightTokenCreateRpc({
      expectedChainId: 97401,
      payer: PAYER,
      sleep,
      client: {
        getChainId: async () => {
          chainCalls += 1;
          order.push("chain");
          if (chainCalls === 1) throw new Error("503 Service Unavailable");
          return 97401;
        },
        getBalance: async () => {
          order.push("balance");
          return 10n;
        },
        simulateCreate: async () => {
          order.push("simulate");
          return { ok: true };
        },
      },
    }),
    async () => {
      pins += 1;
      order.push("pin");
      return "ipfs://cid/metadata.json";
    },
  );
  assert.equal(pins, 1);
  assert.equal(chainCalls, 2);
  assert.equal(uri, "ipfs://cid/metadata.json");
  assert.deepEqual(order, ["chain", "chain", "balance", "simulate", "pin"]);
});

test("a failed placeholder simulation does not pin", async () => {
  let pins = 0;
  await assert.rejects(
    () => pinAfterCreatePreflight(
      () => preflightTokenCreateRpc({
        expectedChainId: 97401,
        payer: PAYER,
        sleep,
        client: {
          getChainId: async () => 97401,
          getBalance: async () => 1n,
          simulateCreate: async () => ({ ok: false }),
        },
      }),
      async () => {
        pins += 1;
        return "ipfs://cid/metadata.json";
      },
    ),
  );
  assert.equal(pins, 0);
});

test("the launch form checks duplicates, then the RPC, then pins", () => {
  const src = readFileSync(new URL("../src/components/factory/EvmTokenLaunch.tsx", import.meta.url), "utf8");
  const duplicate = src.indexOf("findDuplicateTokens(knownTokens");
  const preflight = src.indexOf("preflightTokenCreateRpc(");
  const icon = src.indexOf("await uploadTokenIcon(");
  const pin = src.indexOf("pinTokenMetadataAfterChecks(");
  assert.ok(duplicate !== -1 && preflight !== -1 && icon !== -1 && pin !== -1);
  assert.ok(duplicate < preflight && preflight < icon && icon < pin);
});
