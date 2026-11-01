import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  WALLET_SESSION_STORAGE_KEY,
  WALLET_SESSION_TTL_MS,
  clearWalletSession,
  createSessionKey,
  decryptSessionPayload,
  encryptSessionPayload,
  isEnvelopeExpired,
  parseSessionEnvelope,
  persistWalletSession,
  restoreWalletSession,
  type PersistedWalletSession,
} from "./wallet-session-store.ts";

const SESSION: PersistedWalletSession = {
  id: "wallet-1",
  address: `0x${"ab".repeat(20)}`,
  privateKey: `0x${"cd".repeat(32)}`,
  publicKey: `0x${"ef".repeat(32)}`,
  kind: "local",
};

interface FakeRequest {
  result?: unknown;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded?: (() => void) | null;
}

/** Minimal event-based IndexedDB stand-in covering open/get/put/delete on a single store. */
function installFakeIndexedDB() {
  const databases = new Map<string, Map<string, Map<string, unknown>>>();
  const open = (name: string) => {
    const stores = databases.get(name) ?? new Map<string, Map<string, unknown>>();
    databases.set(name, stores);
    const request: FakeRequest = { onsuccess: null, onerror: null, onupgradeneeded: null };
    queueMicrotask(() => {
      const db = {
        objectStoreNames: { contains: (store: string) => stores.has(store) },
        createObjectStore: (store: string) => {
          if (!stores.has(store)) stores.set(store, new Map());
        },
        transaction: (storeName: string) => ({
          objectStore: () => {
            let map = stores.get(storeName);
            if (!map) {
              map = new Map();
              stores.set(storeName, map);
            }
            const store = map;
            const respond = (result: unknown): FakeRequest => {
              const inner: FakeRequest = { result, onsuccess: null, onerror: null };
              queueMicrotask(() => inner.onsuccess?.());
              return inner;
            };
            return {
              get: (key: string) => respond(store.get(key)),
              put: (value: unknown, key: string) => {
                store.set(key, value);
                return respond(undefined);
              },
              delete: (key: string) => {
                store.delete(key);
                return respond(undefined);
              },
            };
          },
        }),
        close: () => {},
      };
      request.result = db;
      request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  };
  (globalThis as { indexedDB?: unknown }).indexedDB = { open };
  return databases;
}

function installFakeSessionStorage() {
  const values = new Map<string, string>();
  (globalThis as { sessionStorage?: unknown }).sessionStorage = {
    getItem: (key: string) => (values.has(key) ? (values.get(key) as string) : null),
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
  };
  return values;
}

describe("wallet session store", () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    (globalThis as { window?: unknown }).window = {};
    installFakeIndexedDB();
    storage = installFakeSessionStorage();
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  });

  it("mints a non-extractable AES-GCM key", async () => {
    const key = await createSessionKey();
    assert.equal(key.extractable, false);
    assert.equal(key.algorithm.name, "AES-GCM");
    assert.deepEqual(key.usages, ["encrypt", "decrypt"]);
    await assert.rejects(async () => {
      await crypto.subtle.exportKey("raw", key);
    });
  });

  it("encrypts and decrypts a session round-trip", async () => {
    const key = await createSessionKey();
    const envelope = await encryptSessionPayload(SESSION, key, 1_000);
    assert.equal(envelope.exp, 1_000 + WALLET_SESSION_TTL_MS);
    assert.equal(parseSessionEnvelope(JSON.stringify(envelope))?.data, envelope.data);
    assert.deepEqual(await decryptSessionPayload(envelope, key), SESSION);
  });

  it("persists only ciphertext — never the plaintext key", async () => {
    await persistWalletSession(SESSION);
    const stored = storage.get(WALLET_SESSION_STORAGE_KEY);
    assert.ok(stored, "session stored");
    assert.ok(!stored.includes(SESSION.privateKey), "no plaintext private key in sessionStorage");
    assert.ok(!stored.includes(SESSION.privateKey.slice(2)), "no raw private key hex in sessionStorage");
    const envelope = parseSessionEnvelope(stored);
    assert.ok(envelope);
    // The envelope is still decryptable by the (non-exportable) IndexedDB key.
    assert.deepEqual(await restoreWalletSession(), SESSION);
  });

  it("restores a session after a simulated full reload", async () => {
    await persistWalletSession(SESSION);
    // A reload keeps sessionStorage + IndexedDB but resets all module/React state.
    assert.deepEqual(await restoreWalletSession(), SESSION);
    assert.deepEqual(await restoreWalletSession(), SESSION);
  });

  it("slides the idle window on each restore", async () => {
    await persistWalletSession(SESSION);
    const first = parseSessionEnvelope(storage.get(WALLET_SESSION_STORAGE_KEY) ?? null);
    assert.ok(first);
    const restored = await restoreWalletSession(first.exp - 1);
    assert.ok(restored);
    const second = parseSessionEnvelope(storage.get(WALLET_SESSION_STORAGE_KEY) ?? null);
    assert.ok(second);
    assert.ok(second.exp > first.exp, "expiry slid forward");
  });

  it("drops an expired session and clears storage", async () => {
    const key = await createSessionKey();
    const envelope = await encryptSessionPayload(SESSION, key, 0);
    assert.equal(isEnvelopeExpired(envelope, WALLET_SESSION_TTL_MS), true);
    storage.set(WALLET_SESSION_STORAGE_KEY, JSON.stringify(envelope));
    assert.equal(await restoreWalletSession(WALLET_SESSION_TTL_MS), null);
    assert.equal(storage.has(WALLET_SESSION_STORAGE_KEY), false);
  });

  it("rejects a tampered ciphertext instead of restoring a bogus session", async () => {
    await persistWalletSession(SESSION);
    const envelope = parseSessionEnvelope(storage.get(WALLET_SESSION_STORAGE_KEY) ?? null);
    assert.ok(envelope);
    const tampered = new Uint8Array(atob(envelope.data).split("").map((c) => c.charCodeAt(0)));
    tampered[0] ^= 0xff;
    envelope.data = btoa(String.fromCharCode(...tampered));
    storage.set(WALLET_SESSION_STORAGE_KEY, JSON.stringify(envelope));
    assert.equal(await restoreWalletSession(), null);
    assert.equal(storage.has(WALLET_SESSION_STORAGE_KEY), false);
  });

  it("garbage in storage never surfaces a session", async () => {
    storage.set(WALLET_SESSION_STORAGE_KEY, "not-json");
    assert.equal(await restoreWalletSession(), null);
    assert.equal(storage.has(WALLET_SESSION_STORAGE_KEY), false);
  });

  it("strict persist without IndexedDB throws storage_unavailable", async () => {
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
    await assert.rejects(
      () => persistWalletSession(SESSION, 1_000, { strict: true }),
      (err: unknown) => err instanceof Error && err.message === "storage_unavailable",
    );
  });

  it("strict persist failure clears a stale session envelope", async () => {
    storage.set(WALLET_SESSION_STORAGE_KEY, "{\"v\":1,\"stale\":true}");
    const store = globalThis.sessionStorage as { setItem: (key: string, value: string) => void };
    store.setItem = () => {
      throw new Error("quota");
    };
    await assert.rejects(
      () => persistWalletSession(SESSION, 1_000, { strict: true }),
      (err: unknown) => err instanceof Error && err.message === "quota",
    );
    assert.equal(storage.has(WALLET_SESSION_STORAGE_KEY), false);
  });

  it("clears both the ciphertext and the IndexedDB key on lock", async () => {
    await persistWalletSession(SESSION);
    await clearWalletSession();
    assert.equal(storage.has(WALLET_SESSION_STORAGE_KEY), false);
    // With the key gone the previous ciphertext is useless even if it lingers.
    const key = await createSessionKey();
    const envelope = await encryptSessionPayload(SESSION, key);
    storage.set(WALLET_SESSION_STORAGE_KEY, JSON.stringify(envelope));
    assert.equal(await restoreWalletSession(), null);
  });
});
