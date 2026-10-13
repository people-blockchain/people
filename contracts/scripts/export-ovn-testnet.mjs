#!/usr/bin/env node
/**
 * Export public testnet state from the legacy people-node REST API.
 * Output: contracts/deployments/ovn-export.json (no secrets).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import * as secp from "@noble/secp256k1";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "deployments", "ovn-export.json");

const NODE =
  (process.env.OVN_NODE_URL ?? process.env.PEOPLE_NODE_URL ?? "https://node.peopleblockchain.network").replace(
    /\/$/,
    ""
  );

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function legacyAddressFromPublicKey(publicKeyHex) {
  const hex = publicKeyHex.replace(/^0x/i, "");
  return `0x${bytesToHex(sha256(secp.etc.hexToBytes(hex))).slice(0, 40)}`.toLowerCase();
}

function evmAddressFromPublicKey(publicKeyHex) {
  const hex = publicKeyHex.replace(/^0x/i, "");
  const uncompressed = secp.Point.fromHex(hex).toBytes(false);
  const hash = keccak_256(uncompressed.slice(1));
  return `0x${bytesToHex(hash.slice(-20))}`.toLowerCase();
}

async function fetchJson(path) {
  const res = await fetch(`${NODE}${path}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

async function main() {
  const [health, assets, pools, accounts, nfts] = await Promise.all([
    fetchJson("/health"),
    fetchJson("/assets"),
    fetchJson("/liquidity-pools"),
    fetchJson("/accounts"),
    fetchJson("/nfts?limit=500"),
  ]);

  const legacyToCanonical = new Map();
  let cursor = 0;
  const pageSize = 200;
  for (;;) {
    const batch = await fetchJson(`/transactions?limit=${pageSize}&offset=${cursor}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const tx of batch) {
      if (!tx.publicKey || !tx.from) continue;
      const legacy = legacyAddressFromPublicKey(tx.publicKey);
      const canonical = evmAddressFromPublicKey(tx.publicKey);
      if (legacy === String(tx.from).toLowerCase()) {
        legacyToCanonical.set(legacy, canonical);
      }
    }
    if (batch.length < pageSize) break;
    cursor += pageSize;
    if (cursor > 50_000) break;
  }

  const resolveCanonical = (legacyAddr) => {
    const key = String(legacyAddr).toLowerCase();
    return legacyToCanonical.get(key) ?? key;
  };

  const migratedAccounts = (accounts ?? []).map((row) => {
    const canonical = resolveCanonical(row.address);
    const balances = { ...(row.balances ?? {}) };
    return {
      legacyAddress: String(row.address).toLowerCase(),
      address: canonical,
      balance: row.balance ?? 0,
      balances,
      nonce: row.nonce ?? 0,
    };
  });

  const payload = {
    exportedAt: new Date().toISOString(),
    nodeUrl: NODE,
    chainId: health?.chainId ?? null,
    height: health?.height ?? null,
    assets: assets ?? [],
    pools: pools ?? [],
    accounts: migratedAccounts,
    nfts: nfts ?? [],
    addressMap: Object.fromEntries(legacyToCanonical),
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`wrote ${OUT} accounts=${migratedAccounts.length} pools=${(pools ?? []).length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
