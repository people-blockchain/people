import { migratePeopleWebStorage } from "./storageMigration.js";

const WALLET_KEY = "people-wallets";

export interface StoredWallet {
  id: string;
  label: string;
  address: string;
  encryptedPrivateKey: string;
  /** Optional BIP39 mnemonic (encrypted with the same password). */
  encryptedMnemonic?: string;
  createdAt: number;
}

interface EncryptedPayload {
  salt: string;
  iv: string;
  data: string;
  /** Payload format; absent = v1 (the pre-2026 120k-iteration records). */
  version?: number;
  /** PBKDF2 rounds used for this payload. */
  iterations?: number;
}

/** v2 records: 600k PBKDF2 rounds. v1 records used 120k and are migrated on next re-encrypt. */
const PBKDF2_ITERATIONS = 600_000;
const LEGACY_PBKDF2_ITERATIONS = 120_000;

/** Short passwords are the weakest link in an offline attack on local storage. */
export const MIN_WALLET_PASSWORD_LENGTH = 10;

export function isWalletPasswordAcceptable(password: string): boolean {
  return password.length >= MIN_WALLET_PASSWORD_LENGTH;
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
    "deriveKey"
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptPrivateKey(privateKeyHex: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(privateKeyHex)
  );
  const payload: EncryptedPayload = {
    version: 2,
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToHex(salt),
    iv: bytesToHex(iv),
    data: bytesToHex(new Uint8Array(encrypted))
  };
  return JSON.stringify(payload);
}

export async function decryptPrivateKey(payload: string, password: string): Promise<string> {
  const parsed = JSON.parse(payload) as EncryptedPayload;
  const iv = hexToBytes(parsed.iv);
  const data = hexToBytes(parsed.data);
  // Records written before the version field used 120k rounds; honour what the payload says.
  const iterations = Number(parsed.iterations) || LEGACY_PBKDF2_ITERATIONS;
  const key = await deriveKey(password, hexToBytes(parsed.salt), iterations);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

export function loadWallets(): StoredWallet[] {
  try {
    migratePeopleWebStorage(localStorage);
    return JSON.parse(localStorage.getItem(WALLET_KEY) ?? "[]") as StoredWallet[];
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
