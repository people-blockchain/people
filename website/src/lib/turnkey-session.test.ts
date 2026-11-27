import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { isUsableTurnkeySession, readStampLoginSession } from "./turnkey-session.ts";
import {
  forgetTurnkeyRootKey,
  readTurnkeyRootKey,
  rememberTurnkeyRootKey,
  turnkeyAddress,
} from "./turnkey-client.ts";

const SUB = "93a273e9-a23d-4ccc-8748-0fed775eff63";
const NOW = 1_800_000_000_000;

describe("isUsableTurnkeySession", () => {
  it("needs a session for the same sub-org", () => {
    assert.equal(isUsableTurnkeySession(null, SUB, NOW), false);
    assert.equal(isUsableTurnkeySession({ organizationId: "other", expiry: NOW / 1000 + 3600 }, SUB, NOW), false);
    assert.equal(isUsableTurnkeySession({ organizationId: SUB, expiry: NOW / 1000 + 3600 }, SUB, NOW), true);
  });
  it("accepts seconds or ms expiry and rejects nearly expired sessions", () => {
    assert.equal(isUsableTurnkeySession({ organizationId: SUB, expiry: String(NOW + 3_600_000) }, SUB, NOW), true);
    assert.equal(isUsableTurnkeySession({ organizationId: SUB, expiry: NOW / 1000 + 30 }, SUB, NOW), false);
    assert.equal(isUsableTurnkeySession({ organizationId: SUB, expiry: "nope" }, SUB, NOW), false);
  });
});

describe("readStampLoginSession", () => {
  it("reads the session JWT from a STAMP_LOGIN activity", () => {
    const json = { activity: { result: { stampLoginResult: { session: "jwt.token.sig" } } } };
    assert.equal(readStampLoginSession(json), "jwt.token.sig");
    assert.equal(readStampLoginSession({ activity: { status: "ACTIVITY_STATUS_FAILED" } }), "");
    assert.equal(readStampLoginSession(null), "");
  });
});

describe("turnkeyAddress", () => {
  it("returns the EIP-55 checksum address Turnkey requires", () => {
    assert.equal(
      turnkeyAddress("0xcd3abafc9c1a782df74fdaaa9542bfe05e5dba28"),
      "0xCD3Abafc9c1A782DF74FdAaa9542BFe05e5dBa28",
    );
    assert.equal(turnkeyAddress("  not-an-address "), "not-an-address");
  });
});

describe("root key memory", () => {
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
  it("remembers the sub-org root public key across tabs (localStorage)", () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    assert.equal(readTurnkeyRootKey(SUB), "");
    rememberTurnkeyRootKey(SUB, "0x0328220ee1aa");
    assert.equal(readTurnkeyRootKey(SUB), "0328220ee1aa");
    forgetTurnkeyRootKey(SUB);
    assert.equal(readTurnkeyRootKey(SUB), "");
  });
  it("is safe without localStorage", () => {
    assert.equal(readTurnkeyRootKey(SUB), "");
    rememberTurnkeyRootKey(SUB, "abc");
  });
});
