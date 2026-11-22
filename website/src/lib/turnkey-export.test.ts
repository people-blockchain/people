import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as secp from "@noble/secp256k1";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { generateFactoryKey } from "./people-sign.ts";
import { exportedKeyMatchesAddress, TURNKEY_EXPORT_IFRAME_URL } from "./turnkey-export.ts";

secp.hashes.sha256 = sha256;
secp.hashes.hmacSha256 = (key, msg) => hmac(sha256, key, msg);

describe("exportedKeyMatchesAddress", () => {
  it("accepts the secp256k1 key that derives the UI address", () => {
    const key = generateFactoryKey();
    assert.equal(exportedKeyMatchesAddress(key.privateKey, key.address), true);
    assert.equal(exportedKeyMatchesAddress(`0x${key.privateKey}`, key.address.toUpperCase()), true);
  });

  it("rejects a key for a different address or garbage", () => {
    const a = generateFactoryKey();
    const b = generateFactoryKey();
    assert.equal(exportedKeyMatchesAddress(a.privateKey, b.address), false);
    assert.equal(exportedKeyMatchesAddress("not-a-key", a.address), false);
  });

  it("uses Turnkey's official export iframe host", () => {
    assert.equal(TURNKEY_EXPORT_IFRAME_URL, "https://export.turnkey.com");
  });
});
