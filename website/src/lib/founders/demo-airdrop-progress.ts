/**
 * AUDIT M3: per-claim delivery state for the founders demo airdrop, stored in the existing
 * `founder_demo_token_airdrop.txSummary` text column (no schema change).
 *
 * - `null`                → claim reserved, nothing signed yet (legacy rows look like this too).
 * - `{"v":2,…}` (object)  → delivery in progress: every transfer is recorded here *before* it is
 *                           broadcast, together with its signed raw tx, so a retry re-broadcasts
 *                           or confirms that exact transaction instead of paying out again.
 * - `["0x…",…]` (array)   → delivered (the original completed format, unchanged).
 *
 * `leaseUntil` lets one request at a time drive delivery; an expired lease (e.g. the function
 * was killed by a timeout) can be taken over, so a claim can never get stuck in `pending`.
 */
export type AirdropTransferRecord = { hash: `0x${string}`; raw: `0x${string}` };

export type AirdropProgress = {
  v: 2;
  leaseUntil: number;
  sent: Record<string, AirdropTransferRecord>;
};

export function emptyAirdropProgress(): AirdropProgress {
  return { v: 2, leaseUntil: 0, sent: {} };
}

export function isAirdropDelivered(txSummary: string | null | undefined): boolean {
  if (!txSummary) return false;
  return parseAirdropProgress(txSummary) === null;
}

/**
 * Returns the in-progress state, or `null` when `txSummary` is a completed (array / legacy)
 * summary. A `null`/empty column is a fresh reservation.
 */
export function parseAirdropProgress(txSummary: string | null | undefined): AirdropProgress | null {
  if (!txSummary) return emptyAirdropProgress();
  let parsed: unknown;
  try {
    parsed = JSON.parse(txSummary);
  } catch {
    return null; // not ours to interpret: treat as a completed legacy summary
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const obj = parsed as Partial<AirdropProgress>;
  if (obj.v !== 2) return null;
  const sent: Record<string, AirdropTransferRecord> = {};
  for (const [assetId, rec] of Object.entries(obj.sent ?? {})) {
    if (
      rec &&
      typeof rec === "object" &&
      typeof rec.hash === "string" &&
      rec.hash.startsWith("0x") &&
      typeof rec.raw === "string" &&
      rec.raw.startsWith("0x")
    ) {
      sent[assetId] = { hash: rec.hash, raw: rec.raw };
    }
  }
  return { v: 2, leaseUntil: Number(obj.leaseUntil) || 0, sent };
}

export function serializeAirdropProgress(progress: AirdropProgress): string {
  return JSON.stringify({ v: 2, leaseUntil: progress.leaseUntil, sent: progress.sent });
}

export function isLeaseHeld(progress: AirdropProgress, now = Date.now()): boolean {
  return progress.leaseUntil > now;
}
