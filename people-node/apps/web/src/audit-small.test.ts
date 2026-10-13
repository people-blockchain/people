import { beforeEach, describe, expect, test, vi } from "vitest";
import { csvSafeCell } from "./csvExport.js";
import { getSignedAttestation, recordSignedAttestation } from "./attestationLog.js";
import {
  MIN_WALLET_PASSWORD_LENGTH,
  decryptPrivateKey,
  encryptPrivateKey,
  isWalletPasswordAcceptable
} from "./walletStorage.js";

/** Minimal localStorage stand-in; the modules only use getItem/setItem. */
function installLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key)
  });
  return store;
}

describe("M21-6 csvSafeCell", () => {
  test("neutralizes every formula-trigger prefix", () => {
    for (const value of ["=1+1", "+A1", "-2", "@SUM(A1)", "\tcmd", "\rline"]) {
      expect(csvSafeCell(value)).toBe(`'${value}`);
    }
  });

  test("leaves ordinary values alone and stringifies the rest", () => {
    expect(csvSafeCell("0xabc")).toBe("0xabc");
    expect(csvSafeCell(undefined)).toBe("");
    // Negative numbers are escaped too — a leading `-` is a formula trigger in Excel,
    // and the leading quote is still parsed as the number -5.
    expect(csvSafeCell(-5)).toBe("'-5");
  });
});

describe("M21-5 wallet password policy", () => {
  test("requires at least ten characters", () => {
    expect(MIN_WALLET_PASSWORD_LENGTH).toBe(10);
    expect(isWalletPasswordAcceptable("short")).toBe(false);
    expect(isWalletPasswordAcceptable("123456789")).toBe(false);
    expect(isWalletPasswordAcceptable("1234567890")).toBe(true);
  });

  test("round-trips a key and records the v2 parameters", async () => {
    const payload = JSON.parse(await encryptPrivateKey("0xdeadbeef", "a-good-passphrase")) as {
      version: number;
      iterations: number;
    };
    expect(payload.version).toBe(2);
    expect(payload.iterations).toBe(600_000);
    expect(await decryptPrivateKey(JSON.stringify(payload), "a-good-passphrase")).toBe("0xdeadbeef");
  }, 30_000);

  test("still decrypts a legacy 120k-iteration payload", async () => {
    // Re-create a v1 record by deriving the same way the old code did.
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode("a-good-passphrase"), "PBKDF2", false, [
      "deriveKey"
    ]);
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 120_000, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode("0xdeadbeef"));
    const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const legacy = JSON.stringify({
      salt: hex(salt),
      iv: hex(iv),
      data: hex(new Uint8Array(encrypted))
    });
    expect(await decryptPrivateKey(legacy, "a-good-passphrase")).toBe("0xdeadbeef");
  }, 30_000);
});

describe("M21-3 attestation log", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  test("remembers what was signed at a height", () => {
    expect(getSignedAttestation(10)).toBeUndefined();
    recordSignedAttestation(10, "0xabc");
    expect(getSignedAttestation(10)?.hash).toBe("0xabc");
  });

  test("keeps at most the newest 128 heights", () => {
    for (let height = 1; height <= 130; height += 1) {
      recordSignedAttestation(height, `0x${height}`);
    }
    expect(getSignedAttestation(130)?.hash).toBe("0x130");
    expect(getSignedAttestation(2)).toBeUndefined();
  });

  test("survives absent or corrupt storage", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(getSignedAttestation(5)).toBeUndefined();
    expect(() => recordSignedAttestation(5, "0x5")).not.toThrow();
  });
});
