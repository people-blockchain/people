import * as secp from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { EVM_ADDRESS_ACTIVATION_HEIGHT } from "@people/protocol";
import { NATIVE_ASSET_ID } from "./native-asset.js";

export interface EvmAddressMigrationState {
  accounts: Record<string, { balance: number; balances: Record<string, number>; nonce: number }>;
  chain: Array<{ transactions: Array<{ publicKey?: string; from: string }> }>;
  legacyToCanonical?: Record<string, string>;
  evmAddressMigrationApplied?: boolean;
  knownAccountPublicKeys?: Record<string, string>;
}

const { bytesToHex, hexToBytes } = secp.etc;

/** Legacy People address (sha256 of compressed secp256k1 pubkey). */
export function legacyAddressFromPublicKey(publicKeyHex: string): string {
  return `0x${bytesToHex(sha256(hexToBytes(publicKeyHex))).slice(0, 40)}`;
}

/** Ethereum-canonical address (last 20 bytes of keccak256(uncompressed pubkey)). */
export function evmAddressFromPublicKey(publicKeyHex: string): string {
  const hex = publicKeyHex.replace(/^0x/i, "");
  const uncompressed = secp.Point.fromHex(hex).toBytes(false);
  const hash = keccak_256(uncompressed.slice(1));
  return `0x${bytesToHex(hash.slice(-20))}`;
}

/**
 * Protocol signing / keypair address until on-chain migration activates.
 * JSON-RPC and post-activation wallets use {@link evmAddressFromPublicKey}.
 */
export function addressFromPublicKey(publicKeyHex: string): string {
  return legacyAddressFromPublicKey(publicKeyHex);
}

/** EVM-layer canonical address (MetaMask / eth_getBalance). */
export function canonicalEvmAddressFromPublicKey(publicKeyHex: string): string {
  return evmAddressFromPublicKey(publicKeyHex);
}

export function addressesForPublicKey(publicKeyHex: string): { legacy: string; canonical: string } {
  const legacy = legacyAddressFromPublicKey(publicKeyHex);
  const canonical = evmAddressFromPublicKey(publicKeyHex);
  return { legacy: legacy.toLowerCase(), canonical: canonical.toLowerCase() };
}

export function isCanonicalAddressMatch(from: string, publicKeyHex: string): boolean {
  const lower = from.toLowerCase();
  const { legacy, canonical } = addressesForPublicKey(publicKeyHex);
  return lower === legacy || lower === canonical;
}

function mergeAccountFields(
  target: EvmAddressMigrationState["accounts"][string],
  source: EvmAddressMigrationState["accounts"][string]
): void {
  target.balance += source.balance;
  target.balances ??= {};
  source.balances ??= {};
  for (const [assetId, amount] of Object.entries(source.balances)) {
    target.balances[assetId] = (target.balances[assetId] ?? 0) + amount;
  }
  target.nonce = Math.max(target.nonce, source.nonce);
}

function ensureAccountRecord(state: EvmAddressMigrationState, address: string): EvmAddressMigrationState["accounts"][string] {
  const key = address.toLowerCase();
  if (!state.accounts[key]) {
    state.accounts[key] = { balance: 0, balances: { [NATIVE_ASSET_ID]: 0 }, nonce: 0 };
  }
  return state.accounts[key]!;
}

export function collectPublicKeysFromChain(state: EvmAddressMigrationState): Map<string, string> {
  const legacyToPubkey = new Map<string, string>();
  for (const block of state.chain) {
    for (const tx of block.transactions) {
      if (!tx.publicKey) {
        continue;
      }
      const legacy = legacyAddressFromPublicKey(tx.publicKey).toLowerCase();
      legacyToPubkey.set(legacy, tx.publicKey);
    }
  }
  return legacyToPubkey;
}

/** Merge legacy balances into canonical keys; record legacy → canonical aliases. */
export function applyEvmAddressMigration(state: EvmAddressMigrationState): void {
  if (state.evmAddressMigrationApplied) {
    return;
  }
  state.legacyToCanonical ??= {};
  const legacyToPubkey = collectPublicKeysFromChain(state);
  for (const [legacy, pubkey] of legacyToPubkey) {
    const canonical = evmAddressFromPublicKey(pubkey).toLowerCase();
    if (legacy === canonical) {
      continue;
    }
    state.legacyToCanonical[legacy] = canonical;
    const legacyAcct = state.accounts[legacy];
    if (!legacyAcct) {
      continue;
    }
    const canonicalAcct = ensureAccountRecord(state, canonical);
    mergeAccountFields(canonicalAcct, legacyAcct);
    delete state.accounts[legacy];
  }
  state.evmAddressMigrationApplied = true;
}

export function maybeApplyEvmAddressMigration(state: EvmAddressMigrationState, blockHeight: number): void {
  if (state.evmAddressMigrationApplied || blockHeight < EVM_ADDRESS_ACTIVATION_HEIGHT) {
    return;
  }
  applyEvmAddressMigration(state);
}

/** Account map key that holds balances for RPC / reads. */
export function resolveAccountStorageKey(state: EvmAddressMigrationState, address: string): string {
  const query = address.toLowerCase();
  if (state.accounts[query]) {
    return query;
  }
  const alias = state.legacyToCanonical?.[query];
  if (alias && state.accounts[alias]) {
    return alias;
  }
  const legacyEntry = Object.entries(state.legacyToCanonical ?? {}).find(([, canon]) => canon === query);
  if (legacyEntry && state.accounts[legacyEntry[0]]) {
    return legacyEntry[0];
  }
  return query;
}

export function lookupAddressMetadata(
  state: EvmAddressMigrationState,
  address: string
): { address: string; legacy: boolean; canonicalAddress?: string } {
  const query = address.toLowerCase();
  const canonical = state.legacyToCanonical?.[query];
  if (canonical) {
    return { address: query, legacy: true, canonicalAddress: canonical };
  }
  const legacyPair = Object.entries(state.legacyToCanonical ?? {}).find(([, canon]) => canon === query);
  if (legacyPair) {
    return { address: query, legacy: false, canonicalAddress: query };
  }
  return { address: query, legacy: false };
}

export function recordTransactionPublicKey(state: EvmAddressMigrationState, tx: { from: string; publicKey?: string }): void {
  if (!tx.publicKey) {
    return;
  }
  state.knownAccountPublicKeys ??= {};
  const from = tx.from.toLowerCase();
  state.knownAccountPublicKeys[from] = tx.publicKey;
  const { legacy, canonical } = addressesForPublicKey(tx.publicKey);
  state.knownAccountPublicKeys[legacy] = tx.publicKey;
  state.knownAccountPublicKeys[canonical] = tx.publicKey;
}
