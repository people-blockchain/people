import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { generateFactoryKey, signFactoryTx } from "./people-sign.ts";
import { setTurnkeyBrowserBridge, toTurnkeyWalletSession } from "./turnkey-client.ts";
import { sessionHasLocalKey, signSessionFactoryTx } from "./wallet-session-sign.ts";

afterEach(() => {
  setTurnkeyBrowserBridge(null);
});

describe("signSessionFactoryTx", () => {
  it("uses the local private key for vault/cloud sessions", async () => {
    const key = generateFactoryKey();
    const tx = {
      chainId: "chain",
      id: "draft",
      from: key.address,
      to: key.address,
      amount: 0,
      fee: 0,
      nonce: 0,
      timestamp: 1,
      type: "transfer",
    };
    const signed = await signSessionFactoryTx(
      { kind: "cloud", address: key.address, publicKey: key.publicKey, privateKey: key.privateKey },
      tx,
    );
    assert.deepEqual(signed, signFactoryTx(key.privateKey, tx));
    assert.equal(sessionHasLocalKey({ kind: "cloud", privateKey: key.privateKey }), true);
  });

  it("does not treat a Turnkey session as holding a local key", () => {
    const session = toTurnkeyWalletSession({
      userId: "user-1",
      address: "0x1111111111111111111111111111111111111111",
      subOrganizationId: "sub-1",
    });
    assert.equal(sessionHasLocalKey(session), false);
  });
});
