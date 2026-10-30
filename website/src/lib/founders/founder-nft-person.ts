import { createHash, randomBytes } from "node:crypto";
import { inArray } from "drizzle-orm";
import { getAddress, isAddress } from "viem";
import { getDbReady } from "@/db";
import { founderNftPersons, founderNftStampHashes } from "@/db/schema";
import {
  readFoundersHumanPassportConfig,
  type FoundersHumanPassportConfig,
} from "./human-passport-config.ts";

/**
 * Founder NFT personId registry (docs/founder-nft.md).
 *
 * One human = one opaque `personId` (bytes32 hex). The dedup key is the set of Human Passport stamp
 * nullifiers (`credentialSubject.nullifiers`, or the legacy single `credentialSubject.hash`) returned by
 * `GET /v2/stamps/{address}`. Nullifiers are stable across wallets, so a new wallet presenting any
 * already-known nullifier resolves to the same personId (= rebind). The wallet address and the
 * new wallet's score (HP's LIFO dedup scores reused stamps as 0) are deliberately NOT part of the key.
 * Only sha256 digests of nullifiers are stored; raw nullifiers never reach the database or the logs.
 */

const STAMP_HASH_DOMAIN = "people-founder-nft:hp-nullifier:";
const STAMPS_API_ORIGIN = "https://api.passport.xyz";
const MAX_STAMP_PAGES = 10;

export type FounderNftPersonDecision =
  | { kind: "no_stamps" }
  | { kind: "create"; newHashes: string[] }
  | { kind: "existing"; personId: string; newHashes: string[] }
  | { kind: "conflict"; personIds: string[] };

export type FounderNftPersonResult =
  | { ok: true; personId: string; created: boolean; addedHashes: number }
  | { ok: false; error: "no_stamps" | "conflict" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Nullifiers of every stamp in a Stamps API v2 `items` array. A credential contributes its
 * `nullifiers` array when present, otherwise its legacy `hash` (treated as a nullifier).
 * Returns a sorted, de-duplicated list; malformed items are skipped.
 */
export function extractStampNullifiers(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const out = new Set<string>();
  for (const item of items) {
    if (!isRecord(item) || !isRecord(item.credential)) continue;
    const subject = item.credential.credentialSubject;
    if (!isRecord(subject)) continue;
    const raw = Array.isArray(subject.nullifiers) ? subject.nullifiers : [subject.hash];
    for (const value of raw) {
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (trimmed) out.add(trimmed);
    }
  }
  return [...out].sort();
}

/** Stored form of a nullifier: domain-separated sha256, lowercase hex. */
export function hashStampNullifier(nullifier: string): string {
  return createHash("sha256").update(STAMP_HASH_DOMAIN + nullifier).digest("hex");
}

/** Fresh opaque personId: 32 random bytes as 0x-prefixed hex (fits the contract's bytes32). */
export function newFounderNftPersonId(): string {
  return `0x${randomBytes(32).toString("hex")}`;
}

/**
 * Pure decision over the presented stamp hashes and the rows already stored for them.
 * Zero known owners -> create; exactly one -> that person (plus any hashes not yet stored);
 * more than one -> conflict (the stamps belong to different people; never merge).
 */
export function decideFounderNftPerson(
  hashes: readonly string[],
  matches: readonly { stampHash: string; personId: string }[],
): FounderNftPersonDecision {
  const unique = [...new Set(hashes)].sort();
  if (unique.length === 0) return { kind: "no_stamps" };
  const known = new Set(matches.map((m) => m.stampHash));
  const newHashes = unique.filter((h) => !known.has(h));
  const personIds = [...new Set(matches.map((m) => m.personId))].sort();
  if (personIds.length === 0) return { kind: "create", newHashes };
  if (personIds.length === 1) return { kind: "existing", personId: personIds[0], newHashes };
  return { kind: "conflict", personIds };
}

class StampHashRace extends Error {}

/**
 * Resolve (or create on first sight) the personId for a set of HP stamp nullifiers.
 * Runs in one transaction; a concurrent first sight of the same stamps is retried once so both
 * callers end on the same personId. Conflicting matches are refused and logged without raw values.
 */
export async function resolveFounderNftPerson(
  nullifiers: readonly string[],
): Promise<FounderNftPersonResult> {
  const hashes = [...new Set(nullifiers.map(hashStampNullifier))].sort();
  const db = await getDbReady();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await db.transaction(async (tx) => {
        const matches =
          hashes.length === 0
            ? []
            : await tx
                .select({
                  stampHash: founderNftStampHashes.stampHash,
                  personId: founderNftStampHashes.personId,
                })
                .from(founderNftStampHashes)
                .where(inArray(founderNftStampHashes.stampHash, hashes));
        const decision = decideFounderNftPerson(hashes, matches);
        if (decision.kind === "no_stamps") return { ok: false, error: "no_stamps" } as const;
        if (decision.kind === "conflict") {
          console.warn("[founder-nft-person] stamp hashes match several personIds; refused", {
            personIds: decision.personIds,
            presentedHashes: hashes.length,
          });
          return { ok: false, error: "conflict" } as const;
        }

        const created = decision.kind === "create";
        const personId = created ? newFounderNftPersonId() : decision.personId;
        if (created) await tx.insert(founderNftPersons).values({ personId });
        if (decision.newHashes.length > 0) {
          const inserted = await tx
            .insert(founderNftStampHashes)
            .values(decision.newHashes.map((stampHash) => ({ stampHash, personId })))
            .onConflictDoNothing()
            .returning({ stampHash: founderNftStampHashes.stampHash });
          // Another request stored one of these hashes after our read: roll back and re-read.
          if (inserted.length !== decision.newHashes.length) throw new StampHashRace();
        }
        return { ok: true, personId, created, addedHashes: decision.newHashes.length } as const;
      });
    } catch (error) {
      if (!(error instanceof StampHashRace) || attempt > 0) throw error;
    }
  }
  throw new Error("unreachable");
}

export type FounderNftPersonLookup =
  | { kind: "none" }
  | { kind: "found"; personId: string }
  | { kind: "conflict" };

/**
 * Read-only counterpart of `resolveFounderNftPerson`: never creates a person or attaches hashes.
 * Used by status reads and by rebind, which must only ever target a person that already exists.
 */
export async function findFounderNftPerson(nullifiers: readonly string[]): Promise<FounderNftPersonLookup> {
  const hashes = [...new Set(nullifiers.map(hashStampNullifier))].sort();
  if (hashes.length === 0) return { kind: "none" };
  const db = await getDbReady();
  const matches = await db
    .select({ stampHash: founderNftStampHashes.stampHash, personId: founderNftStampHashes.personId })
    .from(founderNftStampHashes)
    .where(inArray(founderNftStampHashes.stampHash, hashes));
  const decision = decideFounderNftPerson(hashes, matches);
  if (decision.kind === "existing") return { kind: "found", personId: decision.personId };
  if (decision.kind === "conflict") return { kind: "conflict" };
  return { kind: "none" };
}

/**
 * True when every stamp that contributes a nullifier is marked `dedup: true` (Human Passport LIFO:
 * this wallet is re-presenting stamps already scored for another address, so its score stays 0).
 * A mix of fresh and deduped stamps is not treated as deduped.
 */
export function stampItemsAreDeduped(items: unknown): boolean {
  if (!Array.isArray(items)) return false;
  let contributing = 0;
  let deduped = 0;
  for (const item of items) {
    if (!isRecord(item)) continue;
    if (extractStampNullifiers([item]).length === 0) continue;
    contributing += 1;
    if (item.dedup === true) deduped += 1;
  }
  return contributing > 0 && deduped === contributing;
}

export type HumanPassportStampsLookup =
  | { ok: true; address: string; nullifiers: string[]; /** True when every contributing stamp is `dedup: true`. */ deduped?: boolean }
  | { ok: false; error: "not_configured" | "invalid_address" | "verification_failed" };

/**
 * Stamp nullifiers held by `walletAddress` (Stamps API v2 `GET /v2/stamps/{address}`, following
 * `next` pages on the same origin). Uses the existing HP config; no score is read here.
 */
export async function fetchHumanPassportStampNullifiers(input: {
  walletAddress: string | null | undefined;
  fetch: typeof fetch;
  readConfig?: () => FoundersHumanPassportConfig | null;
}): Promise<HumanPassportStampsLookup> {
  const config = (input.readConfig ?? readFoundersHumanPassportConfig)();
  if (!config) return { ok: false, error: "not_configured" };
  const raw = input.walletAddress?.trim();
  if (!raw || !isAddress(raw, { strict: false })) return { ok: false, error: "invalid_address" };
  const address = getAddress(raw);

  const items: unknown[] = [];
  let url: string | null = `${STAMPS_API_ORIGIN}/v2/stamps/${address}?limit=1000`;
  for (let page = 0; url && page < MAX_STAMP_PAGES; page += 1) {
    let response: Response;
    try {
      response = await input.fetch(url, { headers: { "X-API-KEY": config.apiKey }, cache: "no-store" });
    } catch {
      return { ok: false, error: "verification_failed" };
    }
    if (!response.ok) return { ok: false, error: "verification_failed" };
    const data = (await response.json()) as { items?: unknown; next?: unknown };
    if (!Array.isArray(data.items)) return { ok: false, error: "verification_failed" };
    items.push(...data.items);
    url = nextStampsPage(data.next);
  }
  if (url) return { ok: false, error: "verification_failed" };
  return { ok: true, address, nullifiers: extractStampNullifiers(items), deduped: stampItemsAreDeduped(items) };
}

function nextStampsPage(next: unknown): string | null {
  if (typeof next !== "string" || !next) return null;
  try {
    const resolved = new URL(next, STAMPS_API_ORIGIN);
    return resolved.origin === STAMPS_API_ORIGIN ? resolved.toString() : null;
  } catch {
    return null;
  }
}
