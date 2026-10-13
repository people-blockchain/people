/**
 * PPL budget for seed-97401.mjs.
 *
 * A People token pool exists only after its bonding curve migrates (PeopleAmmFactory reverts
 * CurveNotMigrated before that). Migration needs the virtual native reserve to reach 3x
 * VIRTUAL_NATIVE_RESERVE (60 PPL), i.e. >120 PPL net of the 1% curve fee, about 123 PPL gross in
 * 3 PPL chunks, whatever the token supply. SEED_MAX_POOLS caps how many new pools one run seeds so a
 * small deployer balance can still finish; remaining pools are seeded by a later idempotent re-run.
 */

/** Parse SEED_MAX_POOLS: unset/empty = no cap; otherwise a non-negative integer. */
export function parseMaxPools(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return Infinity;
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) throw new Error(`SEED_MAX_POOLS must be a non-negative integer, got "${raw}"`);
  return Number(s);
}

/** Parse a non-negative PPL amount from env, with default. */
export function parsePpl(raw, fallback, name) {
  const s = raw === undefined || raw === null || String(raw).trim() === "" ? String(fallback) : String(raw).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`${name} must be a non-negative number, got "${raw}"`);
  return Number(s);
}

/**
 * Minimum deployer balance (whole PPL) before the seed starts creating. Counts only work still to do:
 * tokens to create and pools without a pair (capped by maxPools). 5 + 10 PPL covers NFT mints and gas.
 */
export function seedMinPpl({ tokensToCreate, poolsToCreate, maxPools, maxCurveSpendPpl, fallbackPoolPpl }) {
  const pools = Math.min(poolsToCreate, maxPools);
  return 5 + tokensToCreate * 2 + pools * (maxCurveSpendPpl + fallbackPoolPpl) + 10;
}
