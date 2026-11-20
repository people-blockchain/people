import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { peopleChainPublicName, PEOPLE_MAINNET_BETA_CHAIN_ID, PEOPLE_DEVNET_CHAIN_ID } from "./people-chain-names.ts";

describe("peopleChainPublicName", () => {
  it("labels 97400 as PEOPLE Mainnet Beta and never as a testnet", () => {
    const name = peopleChainPublicName(PEOPLE_MAINNET_BETA_CHAIN_ID);
    assert.equal(name, "PEOPLE Mainnet Beta");
    assert.equal(/testnet/i.test(name), false);
  });

  it("does not call 97401 PEOPLE Mainnet Beta", () => {
    assert.equal(peopleChainPublicName(PEOPLE_DEVNET_CHAIN_ID), "PEOPLE");
  });
});
