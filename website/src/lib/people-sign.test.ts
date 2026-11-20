import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as secp from "@noble/secp256k1";
import { attachFactoryTxSignature, generateFactoryKey, prepareFactoryTx, signFactoryTx } from "./people-sign.ts";

describe("prepareFactoryTx / attachFactoryTxSignature", () => {
  it("round-trips with a local key the same way as signFactoryTx", () => {
    const key = generateFactoryKey();
    const tx = {
      chainId: "chain",
      id: "draft",
      from: "0x00",
      to: key.address,
      amount: 2,
      fee: 0.1,
      nonce: 3,
      timestamp: 4,
      type: "transfer",
    };
    const local = signFactoryTx(key.privateKey, tx);
    const { prepared, message, publicKey } = prepareFactoryTx(key.address, key.publicKey, tx);
    const signature = secp.etc.bytesToHex(secp.sign(message, secp.etc.hexToBytes(key.privateKey)));
    const attached = attachFactoryTxSignature(prepared, publicKey, signature);
    assert.deepEqual(attached, local);
  });
});
