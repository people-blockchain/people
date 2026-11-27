import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import * as secp from "@noble/secp256k1";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { pointEncode, uint8ArrayToHexString } from "@turnkey/encoding";
import { generateFactoryKey, signFactoryTx } from "./people-sign.ts";
import { LEGACY_ADDRESS_MISMATCH, TURNKEY_API_PUBKEY_STORAGE_KEY } from "./turnkey-constants.ts";
import {
  compactSignatureHex,
  decryptLegacyVaultForImport,
  forgetTurnkeyApiPublicKeyMemory,
  isTurnkeySession,
  matchLegacyVaultKey,
  parseSignRawPayload,
  readTurnkeyApiPublicKey,
  recoverCompressedPublicKey,
  rememberTurnkeyApiPublicKey,
  setTurnkeyBrowserBridge,
  signTurnkeyPeopleTx,
  stampTurnkeyActivityBody,
  toTurnkeyWalletSession,
} from "./turnkey-client.ts";
import { buildInitImportActivity, parseTurnkeyApiStamp } from "./turnkey-stamp.ts";
import { deriveUserWrapKeyHex, encryptPrivateKeyForVault } from "./wallet-cloud-crypto.ts";
import { evmAddressFromPublicKey, legacyAddressFromPublicKey } from "./wallet-address-scheme.ts";
import { isAuthTimeFresh } from "./wallet-reauth-window.ts";

async function withAddressScheme<T>(scheme: "evm" | "legacy", fn: () => T | Promise<T>): Promise<T> {
  const prevChain = process.env.NEXT_PUBLIC_CHAIN;
  const prevFlag = process.env.NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES;
  try {
    if (scheme === "legacy") {
      process.env.NEXT_PUBLIC_CHAIN = "people-node";
      delete process.env.NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES;
    } else {
      process.env.NEXT_PUBLIC_CHAIN = "cosmos-evm";
      process.env.NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES = "evm";
    }
    return await fn();
  } finally {
    if (prevChain === undefined) delete process.env.NEXT_PUBLIC_CHAIN;
    else process.env.NEXT_PUBLIC_CHAIN = prevChain;
    if (prevFlag === undefined) delete process.env.NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES;
    else process.env.NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES = prevFlag;
  }
}

secp.hashes.sha256 = sha256;
secp.hashes.hmacSha256 = (key, msg) => hmac(sha256, key, msg);

function installFakeSessionStorage() {
  const values = new Map<string, string>();
  (globalThis as { sessionStorage?: unknown }).sessionStorage = {
    getItem: (key: string) => (values.has(key) ? (values.get(key) as string) : null),
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
  };
  return values;
}

afterEach(() => {
  setTurnkeyBrowserBridge(null);
  forgetTurnkeyApiPublicKeyMemory();
  delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
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

  it("returns the live EVM address when matching a sha256 vault in evm scheme", async () => {
    await withAddressScheme("evm", () => {
      const key = generateFactoryKey();
      const legacy = legacyAddressFromPublicKey(key.publicKey);
      const evm = evmAddressFromPublicKey(key.publicKey);
      assert.notEqual(legacy.toLowerCase(), evm.toLowerCase());
      const fromLegacy = matchLegacyVaultKey({ address: legacy }, key.privateKey);
      assert.equal(fromLegacy.ok, true);
      if (fromLegacy.ok) assert.equal(fromLegacy.address, evm.toLowerCase());
      const fromEvm = matchLegacyVaultKey({ address: evm }, key.privateKey);
      assert.equal(fromEvm.ok, true);
      if (fromEvm.ok) assert.equal(fromEvm.address, evm.toLowerCase());
    });
  });

  it("keeps the stored vault address when matching in a legacy scheme", async () => {
    await withAddressScheme("legacy", () => {
      const key = generateFactoryKey();
      const legacy = legacyAddressFromPublicKey(key.publicKey);
      const evm = evmAddressFromPublicKey(key.publicKey);
      const fromLegacy = matchLegacyVaultKey({ address: legacy }, key.privateKey);
      assert.equal(fromLegacy.ok, true);
      if (fromLegacy.ok) assert.equal(fromLegacy.address, legacy.toLowerCase());
      const fromEvm = matchLegacyVaultKey({ address: evm }, key.privateKey);
      assert.equal(fromEvm.ok, true);
      if (fromEvm.ok) assert.equal(fromEvm.address, evm.toLowerCase());
    });
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

describe("legacy vault import before Turnkey init", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("decrypts a production-scheme vault after bootstrap wrap-key and returns the live EVM address", async () => {
    await withAddressScheme("evm", async () => {
      const userId = "user-import-1";
      const secret = "test-master-secret-for-hkdf-only";
      const wrap = await deriveUserWrapKeyHex(secret, userId);
      const key = generateFactoryKey();
      const legacy = legacyAddressFromPublicKey(key.publicKey);
      const evm = evmAddressFromPublicKey(key.publicKey);
      const encryptedPrivateKey = await encryptPrivateKeyForVault(key.privateKey, wrap);
      const order: string[] = [];
      globalThis.fetch = (async (url: string | URL) => {
        const path = String(url);
        if (path.includes("/api/wallet/turnkey/bootstrap")) {
          order.push("bootstrap");
          return new Response(JSON.stringify({ subOrganizationId: "sub", turnkeyUserId: "tk-user" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (path.includes("/api/wallet/vault/wrap-key")) {
          order.push("wrap-key");
          return new Response(JSON.stringify({ wrapKeyHex: wrap, version: 1 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (path.includes("/api/wallet/vault")) {
          order.push("vault");
          return new Response(
            JSON.stringify({
              address: legacy,
              publicKey: key.publicKey,
              encryptedPrivateKey,
              vaultVersion: 1,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        throw new Error(`unexpected fetch ${path}`);
      }) as typeof fetch;

      await fetch("/api/wallet/turnkey/bootstrap", { method: "POST" });
      const decrypted = await decryptLegacyVaultForImport(userId);
      assert.deepEqual(order, ["bootstrap", "wrap-key", "vault"]);
      assert.equal(decrypted.ok, true);
      if (!decrypted.ok) return;
      assert.equal(decrypted.address, evm.toLowerCase());
      assert.equal(decrypted.privateKey, key.privateKey);
      assert.equal(decrypted.publicKey, key.publicKey);
    });
  });

  it("does not change the wrap key when auth_time is 20s old vs fresh — reauth only gates access", async () => {
    const secret = "test-master-secret-for-hkdf-only";
    const userId = "user-import-1";
    const wrap = await deriveUserWrapKeyHex(secret, userId);
    assert.equal(await deriveUserWrapKeyHex(secret, userId), wrap);
    const signedInAt = Date.now() - 20_000;
    assert.equal(isAuthTimeFresh(signedInAt), true);
    assert.equal(isAuthTimeFresh(signedInAt - 10 * 60 * 1000), false);
  });

  it("builds an X-Stamp from a WebCrypto non-extractable P-256 key persisted across bootstrap", async () => {
    const storage = installFakeSessionStorage();
    const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, [
      "sign",
      "verify",
    ]);
    assert.equal(keyPair.privateKey.extractable, false);
    const rawPub = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
    const publicKey = uint8ArrayToHexString(pointEncode(rawPub));
    rememberTurnkeyApiPublicKey(publicKey);
    assert.equal(storage.get(TURNKEY_API_PUBKEY_STORAGE_KEY), publicKey);

    // Bootstrap / remount: in-memory copy is gone, IndexedDB key + sessionStorage remain.
    forgetTurnkeyApiPublicKeyMemory();
    assert.equal(readTurnkeyApiPublicKey(), publicKey);

    setTurnkeyBrowserBridge({
      organizationId: "parent",
      createApiKeyPair: async () => publicKey,
      storeSession: () => undefined,
      getApiKeyPublicKey: () => readTurnkeyApiPublicKey() || null,
      signWithApiKey: async ({ message }) => {
        const ieee = new Uint8Array(
          await crypto.subtle.sign(
            { name: "ECDSA", hash: { name: "SHA-256" } },
            keyPair.privateKey,
            new TextEncoder().encode(message),
          ),
        );
        return uint8ArrayToHexString(ieee);
      },
      signRawPayload: async () => ({ r: "00", s: "00" }),
    });

    const activity = buildInitImportActivity({
      organizationId: "11111111-1111-1111-1111-111111111111",
      userId: "22222222-2222-2222-2222-222222222222",
      timestampMs: "9",
    });
    const stamped = await stampTurnkeyActivityBody(activity);
    assert.equal(stamped.stampedBody, JSON.stringify(activity));
    const parsed = parseTurnkeyApiStamp(stamped.stamp);
    assert.equal(parsed.publicKey, publicKey);
    assert.match(parsed.signature, /^30/);
    assert.equal(parsed.scheme, "SIGNATURE_SCHEME_TK_API_P256");
  });
});
