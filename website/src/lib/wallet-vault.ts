const WALLET_KEY = "ppl-web-wallets";

export interface StoredWallet {
  id: string;
  label: string;
  address: string;
  encryptedPrivateKey: string;
  encryptedMnemonic?: string;
  createdAt: number;
  backupConfirmedAt?: number;
}

/** Current on-disk payload version. v1 (unversioned) used 120k PBKDF2 iterations. */
export const VAULT_PAYLOAD_VERSION = 2;
const PBKDF2_ITERATIONS = 600_000;
const LEGACY_PBKDF2_ITERATIONS = 120_000;

interface EncryptedPayload {
  v?: number;
  /** PBKDF2 iteration count; absent on v1 records (implicitly 120k). */
  iterations?: number;
  salt: string;
  iv: string;
  data: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const normalized = hex.replace(/^0x/, "");
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptSecret(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  const payload: EncryptedPayload = {
    v: VAULT_PAYLOAD_VERSION,
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToHex(salt),
    iv: bytesToHex(iv),
    data: bytesToHex(new Uint8Array(encrypted)),
  };
  return JSON.stringify(payload);
}

function payloadIterations(parsed: EncryptedPayload): number {
  if (typeof parsed.iterations === "number" && Number.isSafeInteger(parsed.iterations) && parsed.iterations > 0) {
    return parsed.iterations;
  }
  // v1 records predate the `iterations` field and always used 120k.
  return LEGACY_PBKDF2_ITERATIONS;
}

/** True when a stored payload still uses the legacy KDF parameters and should be re-encrypted. */
export function isLegacySecretPayload(payload: string): boolean {
  try {
    const parsed = JSON.parse(payload) as EncryptedPayload;
    return typeof parsed?.v !== "number" || parsed.v < VAULT_PAYLOAD_VERSION;
  } catch {
    return false;
  }
}

export async function decryptSecret(payload: string, password: string): Promise<string> {
  const parsed = JSON.parse(payload) as EncryptedPayload;
  const iv = hexToBytes(parsed.iv);
  const data = hexToBytes(parsed.data);
  if (!parsed || typeof parsed.salt !== "string" || typeof parsed.data !== "string" || typeof parsed.iv !== "string") {
    // e.g. a cloud-vault `{v,iv,ct}` blob or a foreign keystore: not a password problem.
    throw new Error("unsupported_keystore");
  }
  const salt = hexToBytes(parsed.salt);
  const primary = payloadIterations(parsed);
  // Try the declared KDF cost first, then the other one this app has ever written, so a record
  // whose metadata disagrees with how it was encrypted still opens with the right password.
  const candidates = [primary, ...[PBKDF2_ITERATIONS, LEGACY_PBKDF2_ITERATIONS].filter((n) => n !== primary)];
  let lastError: unknown;
  for (const iterations of candidates) {
    try {
      const key = await deriveKey(password, salt, iterations);
      const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
      return new TextDecoder().decode(decrypted);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * Decrypt and, for legacy (v1) payloads, also return a re-encrypted copy using the current
 * KDF parameters so the caller can persist the upgrade after a successful unlock.
 */
export async function decryptSecretWithUpgrade(
  payload: string,
  password: string
): Promise<{ plaintext: string; upgraded: string | null }> {
  const plaintext = await decryptSecret(payload, password);
  const upgraded = isLegacySecretPayload(payload) ? await encryptSecret(plaintext, password) : null;
  return { plaintext, upgraded };
}

export function loadWallets(): StoredWallet[] {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(WALLET_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((wallet): wallet is StoredWallet => !!wallet && typeof wallet.id === "string" && typeof wallet.label === "string" && typeof wallet.address === "string" && typeof wallet.encryptedPrivateKey === "string") : [];
  } catch {
    return [];
  }
}

export function saveWallets(wallets: StoredWallet[]): void {
  localStorage.setItem(WALLET_KEY, JSON.stringify(wallets));
}

export function upsertWallet(wallet: StoredWallet): void {
  const wallets = loadWallets().filter((item) => item.id !== wallet.id && item.address !== wallet.address);
  wallets.push(wallet);
  saveWallets(wallets);
}

export function removeWallet(id: string): void {
  saveWallets(loadWallets().filter((wallet) => wallet.id !== id));
}
