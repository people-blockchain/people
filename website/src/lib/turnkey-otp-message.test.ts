import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { otpLoginSignaturePayload, turnkeyClientSignature } from "./turnkey-otp-message.ts";

function fakeJwt(payload: Record<string, unknown>): string {
  const json = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${json}.sig`;
}

describe("otpLoginSignaturePayload", () => {
  it("signs USAGE_TYPE_LOGIN over the session public key and token id", () => {
    const token = fakeJwt({ id: "tok-1", public_key: "aa".repeat(32) });
    const sessionKey = "bb".repeat(32);
    const signed = otpLoginSignaturePayload(token, sessionKey);
    assert.equal(signed.publicKey, sessionKey);
    const parsed = JSON.parse(signed.message) as {
      login: { publicKey: string };
      tokenId: string;
      type: string;
    };
    assert.equal(parsed.type, "USAGE_TYPE_LOGIN");
    assert.equal(parsed.tokenId, "tok-1");
    assert.equal(parsed.login.publicKey, sessionKey);
    const bundle = turnkeyClientSignature({ ...signed, signature: "cc" });
    assert.equal(bundle.scheme, "CLIENT_SIGNATURE_SCHEME_API_P256");
  });

  it("rejects a token without an id", () => {
    const token = fakeJwt({ public_key: "aa".repeat(32) });
    assert.throws(() => otpLoginSignaturePayload(token, "bb".repeat(32)), /invalid_otp/);
  });
});
