/**
 * Client + server helpers for the People Wallet cloud vault.
 * Private keys are AES-256-GCM encrypted; the wrapping key is HKDF-derived per user id.
 */

export const WALLET_VAULT_HKDF_SALT = "people-wallet-vault-v1";
export const WALLET_VAULT_HKDF_INFO_PREFIX = "ppl-user-wrap:";

export interface VaultCiphertext {
  v: 1;
  iv: string;
  ct: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const normalized = hex.replace(/^0x/, "");
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export async function deriveUserWrapKeyHex(masterSecret: string, userId: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(masterSecret), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: enc.encode(WALLET_VAULT_HKDF_SALT),
      info: enc.encode(`${WALLET_VAULT_HKDF_INFO_PREFIX}${userId}`),
    },
    keyMaterial,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

async function importAesKey(wrapKeyHex: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", hexToBytes(wrapKeyHex), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptPrivateKeyForVault(privateKeyHex: string, wrapKeyHex: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAesKey(wrapKeyHex);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(privateKeyHex.trim()));
  const payload: VaultCiphertext = { v: 1, iv: bytesToHex(iv), ct: bytesToHex(new Uint8Array(ct)) };
  return JSON.stringify(payload);
}

export async function decryptPrivateKeyFromVault(payloadJson: string, wrapKeyHex: string): Promise<string> {
  const payload = JSON.parse(payloadJson) as VaultCiphertext;
  if (payload.v !== 1 || !payload.iv || !payload.ct) {
    throw new Error("invalid_vault_payload");
  }
  const key = await importAesKey(wrapKeyHex);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: hexToBytes(payload.iv) },
    key,
    hexToBytes(payload.ct),
  );
  return new TextDecoder().decode(plain).trim().toLowerCase().replace(/^0x/, "");
}
