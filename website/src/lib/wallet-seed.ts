import { HDKey } from "@scure/bip32";
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { keyFromPrivate, type FactoryKeyPair } from "@/lib/people-sign";

/** Same BIP44 path as `@people/web` (`apps/web/src/seedPhrase.ts`). */
export const PPL_DERIVATION_PATH = "m/44'/60'/0'/0/0";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeMnemonic(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

export function isValidMnemonic(input: string): boolean {
  return validateMnemonic(normalizeMnemonic(input), wordlist);
}

export function generateWalletMnemonic(): string {
  return generateMnemonic(wordlist, 128);
}

/**
 * Address the import form should show before the user confirms.
 * JSON backups need the password to decrypt, so they have no preview.
 */
export function previewWalletImport(
  input: string
): { address: string } | { error: "invalid_private_key" } | null {
  const text = input.trim();
  if (!text || text.startsWith("{")) return null;
  if (isValidMnemonic(text)) return { address: keyPairFromMnemonic(text).address };
  try {
    return { address: keyFromPrivate(text).address };
  } catch (err) {
    if (err instanceof Error && err.message === "invalid_private_key") {
      return { error: "invalid_private_key" };
    }
    throw err;
  }
}

export function keyPairFromMnemonic(mnemonic: string): FactoryKeyPair {
  const normalized = normalizeMnemonic(mnemonic);
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error("invalid_mnemonic");
  }
  const seed = mnemonicToSeedSync(normalized);
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive(PPL_DERIVATION_PATH);
  if (!child.privateKey) {
    throw new Error("mnemonic_derive_failed");
  }
  return keyFromPrivate(bytesToHex(child.privateKey));
}

export function createMnemonicWallet(): { mnemonic: string; key: FactoryKeyPair } {
  const mnemonic = generateWalletMnemonic();
  return { mnemonic, key: keyPairFromMnemonic(mnemonic) };
}

export function pickMnemonicConfirmIndices(wordCount: number, count = 3): number[] {
  const positions = Array.from({ length: wordCount }, (_, i) => i + 1);
  for (let i = positions.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j]!, positions[i]!];
  }
  return positions.slice(0, Math.min(count, wordCount)).sort((a, b) => a - b);
}

export function verifyMnemonicConfirm(
  mnemonic: string,
  answers: Array<{ index: number; word: string }>
): boolean {
  const words = normalizeMnemonic(mnemonic).split(" ");
  return answers.every((item) => words[item.index - 1] === item.word.trim().toLowerCase());
}
