import { test } from "node:test";
import assert from "node:assert/strict";
import { toValoperAddress } from "../src/lib/evm/staking-address.ts";

test("checksummed hex operator becomes bech32 valoper (node0 on testnet 97401)", () => {
  assert.equal(
    toValoperAddress("0xae7b4A57363F0Aa3F76fc2B5E460bC0D4BcFB565"),
    "peoplevaloper14ea554ek8u928am0c267gc9up49uldt97h7q23",
  );
  assert.equal(
    toValoperAddress("0xf31B292562e93Be281db2601f38400E5a22e9AEc"),
    "peoplevaloper17vdjjftzaya79qwmycql8pqquk3zaxhv448l4c",
  );
});

test("bech32 input is passed through (lower-cased)", () => {
  assert.equal(
    toValoperAddress("peoplevaloper14ea554ek8u928am0c267gc9up49uldt97h7q23"),
    "peoplevaloper14ea554ek8u928am0c267gc9up49uldt97h7q23",
  );
});
