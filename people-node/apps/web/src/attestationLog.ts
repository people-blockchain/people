/**
 * Local log of block hashes this browser has already signed a light attestation for.
 *
 * The attestation payload contains the block hash the connected node reported; the wallet
 * cannot recompute it, so a node that answers the same height with two different hashes
 * could get the device to sign conflicting statements. Remembering what we signed lets us
 * refuse to sign a different hash for a height we already attested, and to notice a node
 * that contradicts itself between two reads of the same height.
 */

import { migratePeopleWebStorage } from "./storageMigration.js";

const ATTESTATION_LOG_KEY = "people-light-attestations";
const MAX_ENTRIES = 128;

export interface SignedAttestation {
  hash: string;
  at: number;
}

type AttestationLog = Record<string, SignedAttestation>;

function loadLog(): AttestationLog {
  try {
    migratePeopleWebStorage(localStorage);
    const parsed = JSON.parse(localStorage.getItem(ATTESTATION_LOG_KEY) ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const log: AttestationLog = {};
    for (const [height, value] of Object.entries(parsed as Record<string, unknown>)) {
      const entry = value as Partial<SignedAttestation> | null;
      if (entry && typeof entry.hash === "string" && typeof entry.at === "number") {
        log[height] = { hash: entry.hash, at: entry.at };
      }
    }
    return log;
  } catch {
    return {};
  }
}

export function getSignedAttestation(height: number): SignedAttestation | undefined {
  return loadLog()[String(height)];
}

export function recordSignedAttestation(height: number, hash: string): void {
  const log = loadLog();
  log[String(height)] = { hash, at: Date.now() };
  const heights = Object.keys(log)
    .map((key) => Number(key))
    .filter((height) => Number.isFinite(height))
    .sort((a, b) => a - b);
  for (const stale of heights.slice(0, Math.max(0, heights.length - MAX_ENTRIES))) {
    delete log[String(stale)];
  }
  try {
    localStorage.setItem(ATTESTATION_LOG_KEY, JSON.stringify(log));
  } catch {
    // Storage full/blocked: the in-session ref still guards against re-signing.
  }
}
