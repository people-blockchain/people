import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { walletModalReducer } from "./wallet-modal-state.ts";
import { externalWalletConnectAvailable } from "./wallet-external-connect.ts";

describe("walletModalReducer", () => {
  it("opens and closes", () => {
    assert.equal(walletModalReducer(false, { type: "open" }), true);
    assert.equal(walletModalReducer(true, { type: "close" }), false);
  });
});

describe("externalWalletConnectAvailable", () => {
  it("tracks wallet feature flag", () => {
    assert.equal(externalWalletConnectAvailable(), true);
  });
});
