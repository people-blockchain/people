import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import * as secp from "@noble/secp256k1";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { generateFactoryKey, signFactoryTx } from "./people-sign.ts";
import { LEGACY_ADDRESS_MISMATCH } from "./turnkey-constants.ts";
import {
  compactSignatureHex,
  isTurnkeySession,
  matchLegacyVaultKey,
  parseSignRawPayload,
  recoverCompressedPublicKey,
  setTurnkeyBrowserBridge,
  signTurnkeyPeopleTx,
  toTurnkeyWalletSession,
} from "./turnkey-client.ts";

secp.hashes.sha256 = sha256;
secp.hashes.hmacSha256 = (key, msg) => hmac(sha256, key, msg);

afterEach(() => {
  setTurnkeyBrowserBridge(null);
});

describe("Turnkey client helpers", () => {
  it("compacts r/s into a 64-byte hex signature", () => {
    assert.equal(compactSignatureHex("0x1", "0x2").length, 128);
    assert.match(compactSignatureHex("aa", "bb"), /^0{62}aa0{62}bb$/);
  });

  it("parses nested signRawPayload results", () => {
    const nested = parseSignRawPayload({
      activity: { result: { signRawPayloadResult: { r: "aa", s: "bb", v: "01" } } },
    });
    assert.deepEqual(nested, { r: "aa", s: "bb", v: "01" });
    const flat = parseSignRawPayload({ r: "11", s: "22" });
    assert.equal(flat.r, "11");
  });

  it("tags turnkey sessions and omits a local key", () => {
    const session = toTurnkeyWalletSession({
      userId: "user-1",
      address: "0x1111111111111111111111111111111111111111",
      subOrganizationId: "sub-1",
    });
    assert.equal(isTurnkeySession(session), true);
    assert.equal(session.privateKey, "");
    assert.equal(isTurnkeySession({ kind: "cloud" }), false);
  });

  it("flags a decrypted vault key that does not match the stored address", () => {
    const key = generateFactoryKey();
    const mismatch = matchLegacyVaultKey(
      { address: "0x0000000000000000000000000000000000000001" },
      key.privateKey,
    );
    assert.equal(mismatch.ok, false);
    if (!mismatch.ok) assert.equal(mismatch.error, LEGACY_ADDRESS_MISMATCH);
    const ok = matchLegacyVaultKey({ address: key.address }, key.privateKey);
    assert.equal(ok.ok, true);
  });

  it("signs a PEOPLE tx through a mocked Turnkey bridge with the same digest as signFactoryTx", async () => {
    const key = generateFactoryKey();
    const tx = {
      chainId: "people-public-testnet-v2-2026-09-30",
      id: "draft",
      from: key.address,
      to: key.address,
      amount: 1,
      fee: 0,
      nonce: 0,
      timestamp: 1,
      type: "transfer",
    };
    const local = signFactoryTx(key.privateKey, tx);
    setTurnkeyBrowserBridge({
      organizationId: "parent",
      createApiKeyPair: async () => "pk",
      storeSession: () => undefined,
      signRawPayload: async () => {
        const { prepareFactoryTx } = await import("./people-sign.ts");
        const { message } = prepareFactoryTx(key.address, key.publicKey, tx);
        const compact = secp.etc.bytesToHex(secp.sign(message, secp.etc.hexToBytes(key.privateKey)));
        return { r: compact.slice(0, 64), s: compact.slice(64) };
      },
    });
    const session = toTurnkeyWalletSession({
      userId: "user-1",
      address: key.address,
      publicKey: key.publicKey,
      subOrganizationId: "sub-1",
    });
    const signed = await signTurnkeyPeopleTx(session, tx);
    assert.equal(signed.signature, local.signature);
    assert.equal(signed.publicKey, local.publicKey);
    assert.equal(signed.id, local.id);
  });

  it("recovers the compressed public key from r/s/v", () => {
    const key = generateFactoryKey();
    const message = new TextEncoder().encode("hello-people");
    const recoveredFmt = secp.sign(message, secp.etc.hexToBytes(key.privateKey), { format: "recovered" });
    const signature = secp.Signature.fromBytes(recoveredFmt, "recovered");
    const recovered = recoverCompressedPublicKey({
      r: signature.r.toString(16).padStart(64, "0"),
      s: signature.s.toString(16).padStart(64, "0"),
      v: String(signature.recovery ?? 0),
      messageHashHex: secp.etc.bytesToHex(sha256(message)),
    });
    assert.equal(recovered, key.publicKey);
  });
});
