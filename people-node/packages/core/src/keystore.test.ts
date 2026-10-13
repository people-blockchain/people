import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptPrivateKey, encryptPrivateKey } from "./keystore.js";

const PRIVATE_KEY = "0x" + "ab".repeat(32);
const PASSWORD = "correct horse battery staple";

function payloadOf(): Record<string, unknown> {
  return JSON.parse(encryptPrivateKey(PRIVATE_KEY, PASSWORD)) as Record<string, unknown>;
}

describe("keystore", () => {
  it("round-trips a private key", () => {
    const payload = encryptPrivateKey(PRIVATE_KEY, PASSWORD);
    expect(decryptPrivateKey(payload, PASSWORD)).toBe(PRIVATE_KEY);
  });

  it("records the scrypt parameters used", () => {
    const parsed = payloadOf() as { n: number; r: number; p: number };
    expect(parsed.n).toBe(16384);
    expect(parsed.r).toBe(8);
    expect(parsed.p).toBe(1);
  });

  it("still decrypts payloads written before the params were recorded", () => {
    // A v1-style payload: node's scrypt defaults, no n/r/p fields.
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = scryptSync(PASSWORD, salt, 32);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([cipher.update(PRIVATE_KEY, "utf8"), cipher.final()]);
    const legacy = JSON.stringify({
      salt: salt.toString("hex"),
      iv: iv.toString("hex"),
      tag: cipher.getAuthTag().toString("hex"),
      data: data.toString("hex")
    });
    expect(decryptPrivateKey(legacy, PASSWORD)).toBe(PRIVATE_KEY);
  });

  it("rejects a truncated auth tag instead of accepting it", () => {
    const base = payloadOf();
    const tag = String(base.tag);
    expect(() => decryptPrivateKey(JSON.stringify({ ...base, tag: tag.slice(0, 16) }), PASSWORD)).toThrow(
      /tag/
    );
  });

  it("rejects a tampered ciphertext", () => {
    const base = payloadOf();
    const data = String(base.data);
    const flipped = (data[0] === "0" ? "1" : "0") + data.slice(1);
    expect(() => decryptPrivateKey(JSON.stringify({ ...base, data: flipped }), PASSWORD)).toThrow();
  });

  it("refuses absurd scrypt params rather than allocating huge memory", () => {
    const base = payloadOf();
    expect(() => decryptPrivateKey(JSON.stringify({ ...base, n: 1 << 30 }), PASSWORD)).toThrow(
      /scrypt/
    );
    expect(() => decryptPrivateKey(JSON.stringify({ ...base, n: 1000 }), PASSWORD)).toThrow(
      /scrypt/
    );
    expect(() => decryptPrivateKey(JSON.stringify({ ...base, r: 4096 }), PASSWORD)).toThrow(
      /scrypt/
    );
  });

  it("rejects a wrong password", () => {
    const payload = encryptPrivateKey(PRIVATE_KEY, PASSWORD);
    expect(() => decryptPrivateKey(payload, "wrong password")).toThrow();
  });
});
