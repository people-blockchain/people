import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { fromDerSignature, uncompressRawPublicKey, verifyStampSignature } from "@turnkey/crypto";
import { uint8ArrayFromHexString } from "@turnkey/encoding";
import { parseTurnkeyApiStamp } from "./turnkey-stamp.ts";
import { loadTurnkeyIndexedDbStamper } from "./turnkey-indexed-db-stamper.ts";

type FakeRequest = {
  result?: unknown;
  error?: unknown;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded?: ((event: { target: { result: unknown } }) => void) | null;
};

/** Enough of IndexedDB for Turnkey's IndexedDbStamper (put/get CryptoKey by publicKey hex). */
function installFakeIndexedDB() {
  const stores = new Map<string, Map<string, unknown>>();
  const open = () => {
    const request: FakeRequest = { onsuccess: null, onerror: null, onupgradeneeded: null };
    queueMicrotask(() => {
      const db = {
        objectStoreNames: { contains: (name: string) => stores.has(name) },
        createObjectStore: (name: string) => {
          if (!stores.has(name)) stores.set(name, new Map());
        },
        transaction: (storeName: string) => {
          if (!stores.has(storeName)) stores.set(storeName, new Map());
          const map = stores.get(storeName)!;
          let inflight = 0;
          const tx = {
            oncomplete: null as (() => void) | null,
            onerror: null as ((ev?: unknown) => void) | null,
            onabort: null as (() => void) | null,
            error: null as unknown,
            objectStore: () => ({
              get: (key: string) => {
                inflight += 1;
                const inner: FakeRequest = { result: map.get(key), onsuccess: null, onerror: null };
                queueMicrotask(() => {
                  inner.onsuccess?.();
                  inflight -= 1;
                  if (inflight === 0) queueMicrotask(() => tx.oncomplete?.());
                });
                return inner;
              },
              put: (value: unknown, key: string) => {
                inflight += 1;
                map.set(key, value);
                const inner: FakeRequest = { onsuccess: null, onerror: null };
                queueMicrotask(() => {
                  inner.onsuccess?.();
                  inflight -= 1;
                  if (inflight === 0) queueMicrotask(() => tx.oncomplete?.());
                });
                return inner;
              },
            }),
          };
          return tx;
        },
        close: () => undefined,
      };
      request.result = db;
      request.onupgradeneeded?.({ target: { result: db } });
      request.onsuccess?.();
    });
    return request;
  };
  (globalThis as { indexedDB?: unknown }).indexedDB = { open };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { indexedDB?: unknown }).indexedDB;
});

describe("Turnkey IndexedDbStamper X-Stamp", () => {
  it("stamps with the official kit stamper and verifies P-256 SHA-256 DER", async () => {
    (globalThis as { window?: unknown }).window = globalThis;
    installFakeIndexedDB();
    const stamper = await loadTurnkeyIndexedDbStamper();
    const publicKey = await stamper.createKeyPair();
    assert.match(publicKey, /^[0-9a-f]+$/i);
    assert.equal(publicKey.length, 66);

    const payload = JSON.stringify({
      type: "ACTIVITY_TYPE_INIT_IMPORT_PRIVATE_KEY",
      timestampMs: "1",
      organizationId: "11111111-1111-1111-1111-111111111111",
      parameters: { userId: "22222222-2222-2222-2222-222222222222" },
    });
    const { stampHeaderName, stampHeaderValue } = await stamper.stamp(payload, publicKey);
    assert.equal(stampHeaderName, "X-Stamp");
    const parsed = parseTurnkeyApiStamp(stampHeaderValue);
    assert.equal(parsed.publicKey, publicKey);
    assert.equal(parsed.scheme, "SIGNATURE_SCHEME_TK_API_P256");
    assert.match(parsed.signature, /^30/);
    assert.equal(await verifyStampSignature(parsed.publicKey, parsed.signature, payload), true);

    const ieee = fromDerSignature(parsed.signature);
    const uncompressed = uncompressRawPublicKey(uint8ArrayFromHexString(parsed.publicKey), "CURVE_P256");
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      uncompressed as BufferSource,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      cryptoKey,
      ieee as BufferSource,
      new TextEncoder().encode(payload),
    );
    assert.equal(ok, true);
  });
});
