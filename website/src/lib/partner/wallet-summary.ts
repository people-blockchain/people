/** Partner cabinet: map node account + snapshot Growth claims for display. */

export const NATIVE_ASSET_ID = "ppl";

export type GrowthClaimRow = {
  key: string;
  amount: number;
  status: string;
  level?: number;
  epoch?: number;
};

export type GrowthRewardTotals = {
  accrued: number;
  claimable: number;
  claimed: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function resolvePplBalanceFromAccount(body: unknown): number {
  const rec = asRecord(body);
  if (!rec) return 0;
  const balances = asRecord(rec.balances);
  const fromMap = balances && typeof balances[NATIVE_ASSET_ID] === "number" ? balances[NATIVE_ASSET_ID] : null;
  const raw = fromMap ?? rec.balance;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function formatPplAmount(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${n} PPL`;
}

export function parseGrowthClaimsFromSnapshot(snapshot: unknown, address: string): GrowthClaimRow[] {
  const snap = asRecord(snapshot);
  if (!snap) return [];
  const claimsRaw = snap.growthClaims ?? asRecord(snap.chainState)?.growthClaims;
  if (!claimsRaw || typeof claimsRaw !== "object") return [];
  return parseClaimsRecord(claimsRaw as Record<string, unknown>, address);
}

function parseClaimsRecord(raw: Record<string, unknown>, address: string): GrowthClaimRow[] {
  const addr = address.toLowerCase();
  const claims: GrowthClaimRow[] = [];
  for (const [key, value] of Object.entries(raw)) {
    const row = asRecord(value);
    if (!row) continue;
    const referrer = typeof row.referrer === "string" ? row.referrer.toLowerCase() : "";
    const beneficiary = typeof row.beneficiary === "string" ? row.beneficiary.toLowerCase() : "";
    const to = typeof row.to === "string" ? row.to.toLowerCase() : "";
    if (referrer !== addr && beneficiary !== addr && to !== addr && !key.toLowerCase().includes(addr.slice(2, 10))) {
      continue;
    }
    const amount = typeof row.amount === "number" ? row.amount : Number(row.amount);
    if (!Number.isFinite(amount)) continue;
    const level = typeof row.level === "number" ? row.level : undefined;
    if (level !== undefined && level !== 1 && level !== 2) continue;
    claims.push({
      key,
      amount,
      status: typeof row.status === "string" ? row.status : "unknown",
      level,
      epoch: typeof row.epoch === "number" ? row.epoch : undefined,
    });
  }
  return claims;
}

export function aggregateGrowthRewards(claims: GrowthClaimRow[]): GrowthRewardTotals {
  let accrued = 0;
  let claimable = 0;
  let claimed = 0;
  for (const row of claims) {
    accrued += row.amount;
    if (row.status === "claimable") claimable += row.amount;
    else if (row.status === "settled") claimed += row.amount;
  }
  return { accrued, claimable, claimed };
}
