import { HDKey } from "@scure/bip32";
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { keyPairFromPrivateKey } from "./ovnClient.js";

/** BIP44 path compatible with common secp256k1 wallets (ETH-style). */
export const OVN_DERIVATION_PATH = "m/44'/60'/0'/0/0";

type DerivedKeyPair = ReturnType<typeof keyPairFromPrivateKey>;

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

export function keyPairFromMnemonic(mnemonic: string): DerivedKeyPair {
  const normalized = normalizeMnemonic(mnemonic);
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error("invalid_mnemonic");
  }
  const seed = mnemonicToSeedSync(normalized);
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive(OVN_DERIVATION_PATH);
  if (!child.privateKey) {
    throw new Error("mnemonic_derive_failed");
  }
  return keyPairFromPrivateKey(bytesToHex(child.privateKey));
}

export function createMnemonicWallet(): { mnemonic: string; key: DerivedKeyPair } {
  const mnemonic = generateWalletMnemonic();
  return { mnemonic, key: keyPairFromMnemonic(mnemonic) };
}

export function mnemonicWordCount(mnemonic: string): number {
  return normalizeMnemonic(mnemonic).split(" ").length;
}

/** Pick distinct 1-based positions for confirmation quiz. */
export function pickMnemonicConfirmIndices(wordCount: number, count = 3): number[] {
  const positions = Array.from({ length: wordCount }, (_, i) => i + 1);
  for (let i = positions.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  return positions.slice(0, Math.min(count, wordCount)).sort((a, b) => a - b);
}

export function verifyMnemonicConfirm(
  mnemonic: string,
  answers: Array<{ index: number; word: string }>
): boolean {
  const words = normalizeMnemonic(mnemonic).split(" ");
  return answers.every((item) => {
    const expected = words[item.index - 1];
    return expected !== undefined && expected === item.word.trim().toLowerCase();
  });
}
