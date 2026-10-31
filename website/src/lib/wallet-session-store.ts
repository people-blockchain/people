/**
 * Tab-scoped persistence for an unlocked People Wallet session (E2E-H2).
 *
 * The private key is never written to web storage in the clear. On unlock we mint a
 * non-extractable AES-GCM key, keep it in IndexedDB (CryptoKey is structured-cloneable,
 * but its raw bytes can never be read back by script), and store only the AES-GCM
 * ciphertext in `sessionStorage`. `sessionStorage` dies with the tab, and wiping the
 * IndexedDB key on lock / disconnect / sign-out leaves any stray ciphertext undecryptable.
 */

export const WALLET_SESSION_STORAGE_KEY = "ppl-wallet-session-v1";
/** Sliding unlock window: restored (and slid) on each page load, dies after 12h idle. */
export const WALLET_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const DB_NAME = "ppl-wallet-session";
const DB_VERSION = 1;
const STORE_NAME = "keys";
const KEY_ID = "session-aes-gcm";

export interface PersistedWalletSession {
  id: string;
  address: string;
  privateKey: string;
  publicKey: string;
  kind?: "local" | "cloud";
  userId?: string;
}

export interface SessionEnvelope {
  v: 1;
  iv: string;
  data: string;
  /** Issued-at / last-slid epoch ms. */
  iat: number;
  /** Expiry epoch ms. */
  exp: number;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Non-extractable AES-GCM-256 key: usable for encrypt/decrypt, never exportable. */
export async function createSessionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptSessionPayload(
  session: PersistedWalletSession,
  key: CryptoKey,
  now: number = Date.now()
): Promise<SessionEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(session));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return {
    v: 1,
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(ciphertext)),
    iat: now,
    exp: now + WALLET_SESSION_TTL_MS,
  };
}

export async function decryptSessionPayload(
  envelope: SessionEnvelope,
  key: CryptoKey
): Promise<PersistedWalletSession> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(envelope.iv) },
    key,
    base64ToBytes(envelope.data)
  );
  const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as Partial<PersistedWalletSession> | null;
  if (
    !parsed ||
    typeof parsed.id !== "string" ||
    typeof parsed.address !== "string" ||
    typeof parsed.privateKey !== "string" ||
    typeof parsed.publicKey !== "string"
  ) {
    throw new Error("invalid_session");
  }
  const session: PersistedWalletSession = {
    id: parsed.id,
    address: parsed.address,
    privateKey: parsed.privateKey,
    publicKey: parsed.publicKey,
    kind: parsed.kind === "cloud" ? "cloud" : "local",
  };
  if (typeof parsed.userId === "string") session.userId = parsed.userId;
  return session;
}

export function parseSessionEnvelope(raw: string | null): SessionEnvelope | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SessionEnvelope> | null;
    if (
      !parsed ||
      parsed.v !== 1 ||
      typeof parsed.iv !== "string" ||
      typeof parsed.data !== "string" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }
    return {
      v: 1,
      iv: parsed.iv,
      data: parsed.data,
      iat: typeof parsed.iat === "number" ? parsed.iat : 0,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

export function isEnvelopeExpired(envelope: SessionEnvelope, now: number = Date.now()): boolean {
  return now >= envelope.exp;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("idb_open_failed"));
  });
}

async function runKeyRequest<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error ?? new Error("idb_request_failed"));
    });
  } finally {
    db.close();
  }
}

async function readSessionKey(): Promise<CryptoKey | null> {
  const stored = await runKeyRequest<CryptoKey | undefined>("readonly", (store) => store.get(KEY_ID));
  return stored ?? null;
}

async function writeSessionKey(key: CryptoKey): Promise<void> {
  await runKeyRequest("readwrite", (store) => store.put(key, KEY_ID));
}

export async function deleteSessionKey(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    await runKeyRequest("readwrite", (store) => store.delete(KEY_ID));
  } catch {
    /* storage unavailable / private mode */
  }
}

async function getOrCreateSessionKey(): Promise<CryptoKey> {
  const existing = await readSessionKey();
  if (existing) return existing;
  const created = await createSessionKey();
  await writeSessionKey(created);
  return created;
}

/** Encrypt the unlocked session into tab-scoped storage, sliding the expiry window. */
export async function persistWalletSession(
  session: PersistedWalletSession,
  now: number = Date.now(),
  options?: { strict?: boolean },
): Promise<void> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return;
  try {
    const key = await getOrCreateSessionKey();
    const envelope = await encryptSessionPayload(session, key, now);
    sessionStorage.setItem(WALLET_SESSION_STORAGE_KEY, JSON.stringify(envelope));
  } catch (err) {
    // Local unlock stays best-effort. Cloud sign-in passes strict so the failure is visible.
    if (options?.strict) throw err;
  }
}

/** Restore a previously unlocked session for this tab, or null when absent/expired. */
export async function restoreWalletSession(
  now: number = Date.now()
): Promise<PersistedWalletSession | null> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(WALLET_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
  const envelope = parseSessionEnvelope(raw);
  if (!envelope) {
    if (raw) await clearWalletSession();
    return null;
  }
  if (isEnvelopeExpired(envelope, now)) {
    await clearWalletSession();
    return null;
  }
  try {
    const key = await readSessionKey();
    if (!key) {
      await clearWalletSession();
      return null;
    }
    const session = await decryptSessionPayload(envelope, key);
    // Any restore counts as activity: slide the 12h idle window forward.
    await persistWalletSession(session, now);
    return session;
  } catch {
    await clearWalletSession();
    return null;
  }
}

/** Drop the tab's ciphertext and the IndexedDB key. Used by lock / disconnect / sign-out. */
export async function clearWalletSession(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(WALLET_SESSION_STORAGE_KEY);
  } catch {
    /* storage disabled */
  }
  await deleteSessionKey();
}
