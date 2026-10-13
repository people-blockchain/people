/**
 * Native asset identity: People / PPL.
 * Map keys are lowercase (`ppl`), matching the former `vls` convention.
 * Load-time migration remaps persisted `vls` keys; apply-time canonicalize
 * treats `vls` as an alias so historical txs still settle to native PPL.
 * Not a second live asset.
 */

export const LEGACY_NATIVE_ASSET_ID = "vls";
export const NATIVE_ASSET_ID = "ppl";
export const NATIVE_ASSET_NAME = "People";
export const NATIVE_ASSET_SYMBOL = "PPL";
/** User-created token that occupied `ppl` before native rename. */
export const USER_PPL_COLLISION_ASSET_ID = "ppl-user";

export function nativeLiquidityPoolId(tokenAssetId: string): string {
  return `pool-${NATIVE_ASSET_ID}-${tokenAssetId}`;
}

/**
 * M04-1: read a map only by its own keys. A bare `map[key]` also resolves
 * `Object.prototype` members (`constructor`, `__proto__`, `toString`), so a key
 * taken from a transaction payload could pass an existence check without any
 * state behind it.
 */
export function ownGet<T>(map: Record<string, T> | undefined | null, key: string): T | undefined {
  if (!map || typeof key !== "string" || !Object.hasOwn(map, key)) {
    return undefined;
  }
  return map[key];
}

export function canonicalizeAssetId(assetId: string): string {
  const id = assetId.trim().toLowerCase();
  return id === LEGACY_NATIVE_ASSET_ID ? NATIVE_ASSET_ID : id;
}

type NumericMap = Record<string, number>;

interface MigratableAccount {
  balance?: number;
  balances?: NumericMap;
}

interface MigratableAsset {
  assetId: string;
  type?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  totalSupply?: number;
  creator?: string;
  status?: string;
}

interface MigratablePool {
  poolId: string;
  tokenAssetId: string;
  nativeAssetId: string;
}

interface MigratableCurve {
  liquidityPoolId?: string;
}

interface MigratableCommunityPool {
  pools?: Record<string, { assetId: string; totalAllocated?: number; totalDistributed?: number; remainingBalance?: number }>;
}

export interface MigratableChainState {
  accounts?: Record<string, MigratableAccount>;
  assets?: Record<string, MigratableAsset>;
  treasury?: NumericMap;
  burned?: NumericMap;
  communityPool?: MigratableCommunityPool;
  liquidityPools?: Record<string, MigratablePool>;
  curves?: Record<string, MigratableCurve>;
}

function addNumeric(map: NumericMap, key: string, amount: number): void {
  map[key] = (map[key] ?? 0) + amount;
}

function rekeyNumericMap(map: NumericMap | undefined, from: string, to: string): void {
  if (!map || from === to || !(from in map)) {
    return;
  }
  addNumeric(map, to, map[from] ?? 0);
  delete map[from];
}

function rekeyAssetEverywhere(state: MigratableChainState, from: string, to: string): void {
  if (from === to) {
    return;
  }
  if (state.assets && from in state.assets) {
    const meta = state.assets[from]!;
    delete state.assets[from];
    state.assets[to] = { ...meta, assetId: to };
  }
  for (const account of Object.values(state.accounts ?? {})) {
    rekeyNumericMap(account.balances, from, to);
  }
  rekeyNumericMap(state.treasury, from, to);
  rekeyNumericMap(state.burned, from, to);
  const pools = state.communityPool?.pools;
  if (pools && from in pools) {
    const row = pools[from]!;
    delete pools[from];
    pools[to] = { ...row, assetId: to };
  }
  const legacyPoolId = `pool-${LEGACY_NATIVE_ASSET_ID}-${from}`;
  const nextPoolId = nativeLiquidityPoolId(to);
  if (state.liquidityPools && legacyPoolId in state.liquidityPools) {
    const pool = state.liquidityPools[legacyPoolId]!;
    delete state.liquidityPools[legacyPoolId];
    state.liquidityPools[nextPoolId] = {
      ...pool,
      poolId: nextPoolId,
      tokenAssetId: to,
      nativeAssetId: NATIVE_ASSET_ID
    };
  }
  const currentPoolId = nativeLiquidityPoolId(from);
  if (state.liquidityPools && currentPoolId in state.liquidityPools && currentPoolId !== nextPoolId) {
    const pool = state.liquidityPools[currentPoolId]!;
    delete state.liquidityPools[currentPoolId];
    state.liquidityPools[nextPoolId] = {
      ...pool,
      poolId: nextPoolId,
      tokenAssetId: to,
      nativeAssetId: NATIVE_ASSET_ID
    };
  }
  for (const pool of Object.values(state.liquidityPools ?? {})) {
    if (pool.tokenAssetId === from) {
      pool.tokenAssetId = to;
    }
    if (pool.nativeAssetId === from || pool.nativeAssetId === LEGACY_NATIVE_ASSET_ID) {
      pool.nativeAssetId = NATIVE_ASSET_ID;
    }
  }
  for (const curve of Object.values(state.curves ?? {})) {
    if (curve.liquidityPoolId === legacyPoolId || curve.liquidityPoolId === currentPoolId) {
      curve.liquidityPoolId = nextPoolId;
    }
  }
}

function remapAmmPools(state: MigratableChainState): void {
  const prefix = `pool-${LEGACY_NATIVE_ASSET_ID}-`;
  for (const [poolId, pool] of Object.entries(state.liquidityPools ?? {})) {
    if (pool.nativeAssetId === LEGACY_NATIVE_ASSET_ID) {
      pool.nativeAssetId = NATIVE_ASSET_ID;
    }
    if (!poolId.startsWith(prefix)) {
      continue;
    }
    const tokenAssetId = pool.tokenAssetId || poolId.slice(prefix.length);
    const nextId = nativeLiquidityPoolId(tokenAssetId);
    if (nextId === poolId) {
      continue;
    }
    delete state.liquidityPools![poolId];
    state.liquidityPools![nextId] = { ...pool, poolId: nextId, nativeAssetId: NATIVE_ASSET_ID };
    for (const curve of Object.values(state.curves ?? {})) {
      if (curve.liquidityPoolId === poolId) {
        curve.liquidityPoolId = nextId;
      }
    }
  }
}

/**
 * In-place remap of persisted ChainState from legacy native id `vls` to `ppl`.
 * Amounts are preserved. Does not mint. Idempotent if already on `ppl`.
 */
export function migrateLegacyNativeAssetState(state: MigratableChainState): void {
  const occupying = state.assets?.[NATIVE_ASSET_ID];
  if (occupying && occupying.type !== "native" && state.assets?.[LEGACY_NATIVE_ASSET_ID]) {
    let dest = USER_PPL_COLLISION_ASSET_ID;
    let n = 2;
    while (state.assets?.[dest]) {
      dest = `${USER_PPL_COLLISION_ASSET_ID}-${n}`;
      n += 1;
    }
    rekeyAssetEverywhere(state, NATIVE_ASSET_ID, dest);
  }

  const legacyMeta = state.assets?.[LEGACY_NATIVE_ASSET_ID];
  if (legacyMeta) {
    const totalSupply = Number(legacyMeta.totalSupply ?? 0);
    const decimals = Number.isSafeInteger(legacyMeta.decimals) ? Number(legacyMeta.decimals) : 6;
    delete state.assets![LEGACY_NATIVE_ASSET_ID];
    const existing = state.assets?.[NATIVE_ASSET_ID];
    state.assets![NATIVE_ASSET_ID] = {
      ...(existing ?? {}),
      assetId: NATIVE_ASSET_ID,
      type: "native",
      name: NATIVE_ASSET_NAME,
      symbol: NATIVE_ASSET_SYMBOL,
      decimals,
      totalSupply: existing?.type === "native" ? Number(existing.totalSupply ?? totalSupply) : totalSupply,
      creator: typeof existing?.creator === "string" ? existing.creator : (legacyMeta.creator ?? "genesis"),
      status: typeof existing?.status === "string" ? existing.status : (legacyMeta.status ?? "active")
    };
  } else if (state.assets?.[NATIVE_ASSET_ID]) {
    const current = state.assets[NATIVE_ASSET_ID]!;
    current.assetId = NATIVE_ASSET_ID;
    current.type = "native";
    current.name = NATIVE_ASSET_NAME;
    current.symbol = NATIVE_ASSET_SYMBOL;
  }

  for (const account of Object.values(state.accounts ?? {})) {
    account.balances ??= { [NATIVE_ASSET_ID]: account.balance ?? 0 };
    rekeyNumericMap(account.balances, LEGACY_NATIVE_ASSET_ID, NATIVE_ASSET_ID);
    if (account.balance === undefined) {
      account.balance = account.balances[NATIVE_ASSET_ID] ?? 0;
    } else {
      account.balances[NATIVE_ASSET_ID] = account.balance;
    }
  }

  rekeyNumericMap(state.treasury, LEGACY_NATIVE_ASSET_ID, NATIVE_ASSET_ID);
  rekeyNumericMap(state.burned, LEGACY_NATIVE_ASSET_ID, NATIVE_ASSET_ID);

  const communityPools = state.communityPool?.pools;
  if (communityPools && LEGACY_NATIVE_ASSET_ID in communityPools) {
    const row = communityPools[LEGACY_NATIVE_ASSET_ID]!;
    delete communityPools[LEGACY_NATIVE_ASSET_ID];
    const dest = communityPools[NATIVE_ASSET_ID];
    if (dest) {
      dest.totalAllocated = Number(dest.totalAllocated ?? 0) + Number(row.totalAllocated ?? 0);
      dest.totalDistributed = Number(dest.totalDistributed ?? 0) + Number(row.totalDistributed ?? 0);
      dest.remainingBalance = Number(dest.remainingBalance ?? 0) + Number(row.remainingBalance ?? 0);
      dest.assetId = NATIVE_ASSET_ID;
    } else {
      communityPools[NATIVE_ASSET_ID] = { ...row, assetId: NATIVE_ASSET_ID };
    }
  }

  remapAmmPools(state);
}
