import test from "node:test";
import assert from "node:assert/strict";
import { parseDiscoveryFromBlock } from "./seed-97401-discover.mjs";
import { parseReceiptEvents } from "./seed-97401-block-scan.mjs";

test("parseDiscoveryFromBlock defaults to 0", () => {
  assert.equal(parseDiscoveryFromBlock(""), 0n);
  assert.equal(parseDiscoveryFromBlock(undefined), 0n);
});

test("parseDiscoveryFromBlock accepts decimal and hex", () => {
  assert.equal(parseDiscoveryFromBlock("12345"), 12345n);
  assert.equal(parseDiscoveryFromBlock("0x10"), 16n);
});

test("parseReceiptEvents decodes PairCreated pair from log data", () => {
  const pairAddr = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const token0 = "0x000000000000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const token1 = "0x000000000000000000000000cccccccccccccccccccccccccccccccccccc";
  const data =
    `0x${pairAddr.slice(2).padStart(64, "0")}` + "0000000000000000000000000000000000000000000000000000000000000001";
  const receipt = {
    blockNumber: 100n,
    transactionHash: "0x1234",
    logs: [
      {
        address: "0x24198D61150DEC3184e9daDa267269ef2b98E121",
        topics: [
          "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9",
          token0,
          token1,
        ],
        data,
        logIndex: 0,
      },
    ],
  };
  const parsed = parseReceiptEvents(receipt, {
    ammFactory: "0x24198D61150DEC3184e9daDa267269ef2b98E121",
  });
  assert.equal(parsed.pairs.length, 1);
  assert.equal(parsed.pairs[0].pair, pairAddr.toLowerCase());
});
