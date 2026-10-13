import { pplToAtoms, PPL_SCALE } from "./ppl-units.js";
/**
 * AMM v0.1 — constant-product (x * y = k) token/PPL pools.
 *
 * Swap fee is `AMM_FEE_BPS` (30 bps, 0.30%) kept in the pool as LP fee.
 * That amount is not Growth-eligible (`docs/ECONOMIC-MODEL-v0.1.md` §8).
 * Protocol `tx.fee` on AMM txs is unchanged DEFAULT_TRANSFER_FEE routing.
 *
 * Curve migration (`executeMigration`) already writes a locked LiquidityPoolState
 * without LP fields. Replay of those blocks must keep that object shape; LP
 * accounting is bootstrapped only on the first add/remove after this binary.
 */

import type { AmmQuote, LiquidityPoolState, NetworkConfig, Transaction } from "@ovn/protocol";
import { AMM_FEE_BPS } from "./curve.js";
import { securityUpgradeActive } from "./security-upgrade.js";
import { canonicalizeAssetId, NATIVE_ASSET_ID, nativeLiquidityPoolId, ownGet } from "./native-asset.js";

/** Uniswap v2-style permanent lock on first mint of a brand-new pool. */
export const AMM_MINIMUM_LIQUIDITY = 1000;

/**
 * AMM txs are valid at any height once this binary is running.
 * Historical blocks contain no AMM txs, so genesis replay is unchanged.
 * Coordinated node upgrade is required before submitting AMM txs.
 */
export const AMM_ACTIVATION_HEIGHT = 0;

export { AMM_FEE_BPS };

export interface AmmAccount {
  balance: number;
  balances: Record<string, number>;
  nonce: number;
}

export interface AmmAssetMeta {
  assetId: string;
  type?: string;
  status?: string;
}

export interface AmmHostState {
  accounts: Record<string, AmmAccount>;
  assets: Record<string, AmmAssetMeta>;
  liquidityPools: Record<string, LiquidityPoolState>;
  chain: Array<{ header: { height: number } }>;
  /** Read-only here: M13-1 needs to know whether the token still has a live curve. */
  curves?: Record<string, { status: string }>;
}

export interface AmmSwapResult {
  amountOut: number;
  newReserveIn: number;
  newReserveOut: number;
  lpFee: number;
}

export interface AmmMintResult {
  lpMinted: number;
  newTokenReserve: number;
  newNativeReserve: number;
  newTotalLpSupply: number;
  lockedLpSupply: number;
}

export interface AmmBurnResult {
  tokenOut: number;
  nativeOut: number;
  newTokenReserve: number;
  newNativeReserve: number;
  newTotalLpSupply: number;
}

function nativeUnits(value: number, pool: LiquidityPoolState): number {
  if (pool.nativeScale === undefined) return value;
  if (pool.nativeScale !== PPL_SCALE) throw new Error("Unknown pool native precision");
  return pplToAtoms(value);
}
function nativePpl(value: number, pool: LiquidityPoolState): number {
  return value / (pool.nativeScale ?? 1);
}

function requirePositiveSafeInteger(value: number, label: string): bigint {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return BigInt(value);
}

function requireNonNegativeSafeInteger(value: number, label: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return BigInt(value);
}

export function toSafeInteger(val: bigint, fieldName: string): number {
  if (val < 0n) {
    throw new Error(`Negative value not allowed for ${fieldName}: ${val.toString()}`);
  }
  if (val > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(
      `Value for ${fieldName} (${val.toString()}) exceeds Number.MAX_SAFE_INTEGER (${Number.MAX_SAFE_INTEGER})`
    );
  }
  return Number(val);
}

/** Integer square root (floor). Babylonian method, bigint only. */
export function integerSqrt(n: bigint): bigint {
  if (n < 0n) {
    throw new Error("Square root of negative");
  }
  if (n < 2n) {
    return n;
  }
  let x0 = n;
  let x1 = (n >> 1n) + 1n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x1 + n / x1) >> 1n;
  }
  return x0;
}

export function currentChainHeight(state: AmmHostState): number {
  return state.chain.length > 0 ? state.chain[state.chain.length - 1]!.header.height : 0;
}

export function assertAmmActive(state: AmmHostState): void {
  const height = currentChainHeight(state);
  if (height < AMM_ACTIVATION_HEIGHT) {
    throw new Error(`AMM is not active until height ${AMM_ACTIVATION_HEIGHT}`);
  }
}

function ensureAccount(state: AmmHostState, address: string): AmmAccount {
  if (!state.accounts[address]) {
    state.accounts[address] = { balance: 0, balances: { [NATIVE_ASSET_ID]: 0 }, nonce: 0 };
  } else {
    state.accounts[address]!.balances ??= { [NATIVE_ASSET_ID]: state.accounts[address]!.balance ?? 0 };
  }
  return state.accounts[address]!;
}

function getBalance(account: AmmAccount, assetId: string): number {
  const id = canonicalizeAssetId(assetId);
  if (id === NATIVE_ASSET_ID) {
    return account.balance;
  }
  // M04-1: own keys only, so an inherited key never reads as a balance.
  return ownGet(account.balances, id) ?? 0;
}

function setBalance(account: AmmAccount, assetId: string, amount: number): void {
  const id = canonicalizeAssetId(assetId);
  if (id === NATIVE_ASSET_ID) {
    if (!Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER) {
      throw new Error("Native balance must be a non-negative finite number");
    }
  } else if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error("Balance must be a non-negative safe integer");
  }
  account.balances ??= { [NATIVE_ASSET_ID]: account.balance ?? 0 };
  account.balances[id] = amount;
  if (id === NATIVE_ASSET_ID) {
    account.balance = amount;
  }
}

function debitFee(from: AmmAccount, fee: number): void {
  if (!Number.isFinite(fee) || fee < 0) {
    throw new Error("Invalid transaction fee");
  }
  if (from.balance < fee) {
    throw new Error("Insufficient native balance for fee");
  }
  from.balance -= fee;
  from.balances[NATIVE_ASSET_ID] = from.balance;
}

export function resolvePoolId(payload: Record<string, unknown> | undefined, txAssetId?: string): string {
  const poolIdRaw = payload?.poolId;
  if (typeof poolIdRaw === "string" && poolIdRaw.trim()) {
    return poolIdRaw.trim();
  }
  const tokenAssetId = canonicalizeAssetId(
    String(payload?.tokenAssetId ?? txAssetId ?? "")
  );
  if (!tokenAssetId || tokenAssetId === NATIVE_ASSET_ID) {
    throw new Error("tokenAssetId is required");
  }
  return nativeLiquidityPoolId(tokenAssetId);
}

export function listLiquidityPools(state: AmmHostState): LiquidityPoolState[] {
  return Object.values(state.liquidityPools).sort((a, b) => a.poolId.localeCompare(b.poolId));
}

export function getLiquidityPool(state: AmmHostState, poolId: string): LiquidityPoolState | undefined {
  return state.liquidityPools[poolId];
}

/**
 * Exact-in swap. Full `amountIn` is added to reserveIn; output uses
 * `amountIn * (10000 - feeBps) / 10000` in the product so the LP fee stays in-pool.
 * Floor rounding is in the pool's favor. k is non-decreasing.
 */
export function calculateAmmSwapExactIn(
  reserveIn: number,
  reserveOut: number,
  amountIn: number,
  feeBps: number,
  minAmountOut = 0
): AmmSwapResult {
  const rIn = requirePositiveSafeInteger(reserveIn, "reserveIn");
  const rOut = requirePositiveSafeInteger(reserveOut, "reserveOut");
  const dx = requirePositiveSafeInteger(amountIn, "amountIn");
  if (!Number.isSafeInteger(feeBps) || feeBps < 0 || feeBps >= 10_000) {
    throw new Error("Invalid AMM fee bps");
  }
  if (!Number.isSafeInteger(minAmountOut) || minAmountOut < 0) {
    throw new Error("minAmountOut must be a non-negative safe integer");
  }
  const feeMul = 10_000n - BigInt(feeBps);
  const dxWithFee = dx * feeMul;
  const denominator = rIn * 10_000n + dxWithFee;
  const amountOutBig = (dxWithFee * rOut) / denominator;
  if (amountOutBig <= 0n) {
    throw new Error("Swap output is zero");
  }
  if (amountOutBig >= rOut) {
    throw new Error("Swap would drain the pool");
  }
  const amountOut = toSafeInteger(amountOutBig, "amountOut");
  if (amountOut < minAmountOut) {
    throw new Error(`Slippage limit exceeded: got ${amountOut}, minimum required ${minAmountOut}`);
  }
  const newIn = rIn + dx;
  const newOut = rOut - amountOutBig;
  if (newIn * newOut < rIn * rOut) {
    throw new Error("AMM invariant k decreased");
  }
  const lpFee = toSafeInteger(dx - (dx * feeMul) / 10_000n, "lpFee");
  return {
    amountOut,
    newReserveIn: toSafeInteger(newIn, "reserveIn"),
    newReserveOut: toSafeInteger(newOut, "reserveOut"),
    lpFee
  };
}

function requireUserToken(state: AmmHostState, tokenAssetId: string): string {
  const id = canonicalizeAssetId(tokenAssetId);
  if (!id || id === NATIVE_ASSET_ID) {
    throw new Error("Pool token must be a user-created asset");
  }
  const asset = ownGet(state.assets, id);
  if (!asset) {
    throw new Error(`Asset not found: ${id}`);
  }
  if (asset.status && asset.status !== "active") {
    throw new Error(`Asset is not active: ${id}`);
  }
  return id;
}

function emptyPool(
  poolId: string,
  tokenAssetId: string,
  createdAt: number,
  locked: boolean
): LiquidityPoolState {
  return {
    poolId,
    tokenAssetId,
    nativeAssetId: NATIVE_ASSET_ID,
    tokenReserve: 0,
    nativeReserve: 0,
    feeBps: AMM_FEE_BPS,
    status: "active",
    locked,
    createdAt
  };
}

/**
 * Bootstrap LP accounting on a pool that already has reserves (curve migration)
 * without rewriting historical migration objects until this first LP op.
 */
export function bootstrapLpShares(pool: LiquidityPoolState): void {
  if ((pool.totalLpSupply ?? 0) > 0) {
    return;
  }
  if (pool.tokenReserve <= 0 || pool.nativeReserve <= 0) {
    pool.totalLpSupply = 0;
    pool.lockedLpSupply = 0;
    pool.lpBalances ??= {};
    return;
  }
  const r0 = requirePositiveSafeInteger(pool.tokenReserve, "tokenReserve");
  const r1 = requirePositiveSafeInteger(nativeUnits(pool.nativeReserve, pool), "nativeReserve");
  const boot = integerSqrt(r0 * r1);
  if (boot <= 0n) {
    throw new Error("Cannot bootstrap LP shares from current reserves");
  }
  const supply = toSafeInteger(boot, "totalLpSupply");
  pool.totalLpSupply = supply;
  pool.lockedLpSupply = supply;
  pool.lpBalances ??= {};
}

export function mergeMigratedLiquidity(
  pool: LiquidityPoolState,
  tokenAmount: number,
  nativeAmount: number,
  migratedNativeScale?: number
): { lpMinted: number } {
  const tokenIn = requirePositiveSafeInteger(tokenAmount, "migratedTokenAmount");
  if (migratedNativeScale !== undefined && pool.nativeScale === undefined) {
    if (migratedNativeScale !== PPL_SCALE) {
      throw new Error("Unknown migrated native precision");
    }
    // Existing whole-PPL reserves remain exact at micro-PPL precision.
    pool.nativeScale = PPL_SCALE;
  }
  const nativeIn = requirePositiveSafeInteger(nativeUnits(nativeAmount, pool), "migratedNativeAmount");
  if ((pool.totalLpSupply ?? 0) === 0) {
    bootstrapLpShares(pool);
  }
  const tokenReserve = requireNonNegativeSafeInteger(pool.tokenReserve, "tokenReserve");
  const nativeReserve = requireNonNegativeSafeInteger(nativeUnits(pool.nativeReserve, pool), "nativeReserve");
  const totalSupply = requireNonNegativeSafeInteger(pool.totalLpSupply ?? 0, "totalLpSupply");
  const locked = requireNonNegativeSafeInteger(pool.lockedLpSupply ?? 0, "lockedLpSupply");
  const minted =
    totalSupply > 0n && tokenReserve > 0n && nativeReserve > 0n
      ? mintProportional(tokenIn, nativeIn, tokenReserve, nativeReserve, totalSupply)
      : integerSqrt(tokenIn * nativeIn);
  pool.tokenReserve = toSafeInteger(tokenReserve + tokenIn, "tokenReserve");
  pool.nativeReserve = nativePpl(toSafeInteger(nativeReserve + nativeIn, "nativeReserve"), pool);
  pool.totalLpSupply = toSafeInteger(totalSupply + minted, "totalLpSupply");
  pool.lockedLpSupply = toSafeInteger(locked + minted, "lockedLpSupply");
  pool.lpBalances ??= {};
  return { lpMinted: toSafeInteger(minted, "lpMinted") };
}

export function calculateAddLiquidity(
  pool: LiquidityPoolState,
  tokenAmount: number,
  nativeAmount: number,
  minLpOut = 0
): AmmMintResult {
  const tokenIn = requirePositiveSafeInteger(tokenAmount, "tokenAmount");
  const nativeIn = requirePositiveSafeInteger(nativeUnits(nativeAmount, pool), "nativeAmount");
  if (!Number.isSafeInteger(minLpOut) || minLpOut < 0) {
    throw new Error("minLpOut must be a non-negative safe integer");
  }

  const tokenReserve = requireNonNegativeSafeInteger(pool.tokenReserve, "tokenReserve");
  const nativeReserve = requireNonNegativeSafeInteger(nativeUnits(pool.nativeReserve, pool), "nativeReserve");
  let totalSupply = requireNonNegativeSafeInteger(pool.totalLpSupply ?? 0, "totalLpSupply");
  let locked = requireNonNegativeSafeInteger(pool.lockedLpSupply ?? 0, "lockedLpSupply");

  let lpMinted: bigint;
  let nextSupply: bigint;
  if (totalSupply === 0n) {
    if (tokenReserve > 0n || nativeReserve > 0n) {
      bootstrapLpShares(pool);
      totalSupply = BigInt(pool.totalLpSupply ?? 0);
      locked = BigInt(pool.lockedLpSupply ?? 0);
      if (totalSupply === 0n) {
        throw new Error("Failed to bootstrap LP shares");
      }
      lpMinted = mintProportional(tokenIn, nativeIn, tokenReserve, nativeReserve, totalSupply);
      nextSupply = totalSupply + lpMinted;
    } else {
      const raw = integerSqrt(tokenIn * nativeIn);
      if (raw <= BigInt(AMM_MINIMUM_LIQUIDITY)) {
        throw new Error("Insufficient initial liquidity");
      }
      locked = BigInt(AMM_MINIMUM_LIQUIDITY);
      lpMinted = raw - locked;
      nextSupply = raw;
    }
  } else {
    lpMinted = mintProportional(tokenIn, nativeIn, tokenReserve, nativeReserve, totalSupply);
    nextSupply = totalSupply + lpMinted;
  }

  if (lpMinted <= 0n) {
    throw new Error("Liquidity deposit mints zero LP shares");
  }
  const minted = toSafeInteger(lpMinted, "lpMinted");
  if (minted < minLpOut) {
    throw new Error(`Slippage limit exceeded: got ${minted} LP, minimum required ${minLpOut}`);
  }
  return {
    lpMinted: minted,
    newTokenReserve: toSafeInteger(tokenReserve + tokenIn, "tokenReserve"),
    newNativeReserve: nativePpl(toSafeInteger(nativeReserve + nativeIn, "nativeReserve"), pool),
    newTotalLpSupply: toSafeInteger(nextSupply, "totalLpSupply"),
    lockedLpSupply: toSafeInteger(locked, "lockedLpSupply")
  };
}

function mintProportional(
  tokenIn: bigint,
  nativeIn: bigint,
  tokenReserve: bigint,
  nativeReserve: bigint,
  totalSupply: bigint
): bigint {
  if (tokenReserve <= 0n || nativeReserve <= 0n || totalSupply <= 0n) {
    throw new Error("Cannot add liquidity to an empty pool without a first mint");
  }
  const fromToken = (tokenIn * totalSupply) / tokenReserve;
  const fromNative = (nativeIn * totalSupply) / nativeReserve;
  return fromToken < fromNative ? fromToken : fromNative;
}

export function calculateRemoveLiquidity(
  pool: LiquidityPoolState,
  lpAmount: number,
  minTokenOut = 0,
  minNativeOut = 0
): AmmBurnResult {
  const burn = requirePositiveSafeInteger(lpAmount, "lpAmount");
  const tokenReserve = requirePositiveSafeInteger(pool.tokenReserve, "tokenReserve");
  const nativeReserve = requirePositiveSafeInteger(nativeUnits(pool.nativeReserve, pool), "nativeReserve");
  const totalSupply = requirePositiveSafeInteger(pool.totalLpSupply ?? 0, "totalLpSupply");
  const locked = requireNonNegativeSafeInteger(pool.lockedLpSupply ?? 0, "lockedLpSupply");
  if (!Number.isSafeInteger(minTokenOut) || minTokenOut < 0) {
    throw new Error("minTokenOut must be a non-negative safe integer");
  }
  const minNativeUnits = nativeUnits(minNativeOut, pool);
  if (!Number.isSafeInteger(minNativeUnits) || minNativeUnits < 0) {
    throw new Error("minNativeOut must be a non-negative safe integer");
  }
  if (burn + locked > totalSupply) {
    throw new Error("Cannot burn locked liquidity");
  }
  const tokenOut = (burn * tokenReserve) / totalSupply;
  const nativeOut = (burn * nativeReserve) / totalSupply;
  if (tokenOut <= 0n || nativeOut <= 0n) {
    throw new Error("Liquidity withdrawal returns zero");
  }
  const tokenOutN = toSafeInteger(tokenOut, "tokenOut");
  const nativeOutN = nativePpl(toSafeInteger(nativeOut, "nativeOut"), pool);
  if (tokenOutN < minTokenOut || nativeOutN < minNativeOut) {
    throw new Error(
      `Slippage limit exceeded: got ${tokenOutN} token / ${nativeOutN} PPL, minimum ${minTokenOut} / ${minNativeOut}`
    );
  }
  return {
    tokenOut: tokenOutN,
    nativeOut: nativeOutN,
    newTokenReserve: toSafeInteger(tokenReserve - tokenOut, "tokenReserve"),
    newNativeReserve: nativePpl(toSafeInteger(nativeReserve - nativeOut, "nativeReserve"), pool),
    newTotalLpSupply: toSafeInteger(totalSupply - burn, "totalLpSupply")
  };
}

export function quoteAmmSwap(
  state: AmmHostState,
  poolId: string,
  tokenInRaw: string,
  amountIn: number,
  tokenOutRaw?: string
): AmmQuote {
  const pool = state.liquidityPools[poolId];
  if (!pool) {
    throw new Error(`Pool not found: ${poolId}`);
  }
  if (pool.status !== "active") {
    throw new Error("Pool is not active");
  }
  const tokenIn = canonicalizeAssetId(tokenInRaw);
  const tokenOut = canonicalizeAssetId(tokenOutRaw ?? (tokenIn === NATIVE_ASSET_ID ? pool.tokenAssetId : NATIVE_ASSET_ID));
  const pair = swapReserves(pool, tokenIn, tokenOut);
  const result = calculateAmmSwapExactIn(pair.reserveIn, pair.reserveOut, pair.inIsNative ? nativeUnits(amountIn, pool) : amountIn, pool.feeBps, 0);
  return {
    poolId: pool.poolId,
    tokenIn,
    tokenOut,
    amountIn,
    amountOut: pair.inIsNative ? result.amountOut : nativePpl(result.amountOut, pool),
    lpFee: pair.inIsNative ? nativePpl(result.lpFee, pool) : result.lpFee,
    feeBps: pool.feeBps,
    tokenReserve: pool.tokenReserve,
    nativeReserve: pool.nativeReserve
  };
}

function swapReserves(
  pool: LiquidityPoolState,
  tokenIn: string,
  tokenOut: string
): { reserveIn: number; reserveOut: number; inIsNative: boolean } {
  if (tokenIn === tokenOut) {
    throw new Error("Swap assets must differ");
  }
  const token = canonicalizeAssetId(pool.tokenAssetId);
  const native = canonicalizeAssetId(pool.nativeAssetId);
  const sellingNative = tokenIn === native && tokenOut === token;
  const sellingToken = tokenIn === token && tokenOut === native;
  if (!sellingNative && !sellingToken) {
    throw new Error("AMM v0.1 only supports token/PPL pairs");
  }
  if (sellingNative) {
    return { reserveIn: nativeUnits(pool.nativeReserve, pool), reserveOut: pool.tokenReserve, inIsNative: true };
  }
  return { reserveIn: pool.tokenReserve, reserveOut: nativeUnits(pool.nativeReserve, pool), inIsNative: false };
}

function applyMintToPool(pool: LiquidityPoolState, mint: AmmMintResult, recipient: string): void {
  pool.tokenReserve = mint.newTokenReserve;
  pool.nativeReserve = mint.newNativeReserve;
  pool.totalLpSupply = mint.newTotalLpSupply;
  pool.lockedLpSupply = mint.lockedLpSupply;
  pool.lpBalances ??= {};
  pool.lpBalances[recipient] = (pool.lpBalances[recipient] ?? 0) + mint.lpMinted;
}

export function applyAmmTransaction(
  state: AmmHostState,
  tx: Transaction,
  config: NetworkConfig
): void {
  assertAmmActive(state);
  if (
    tx.type !== "ammCreatePool" &&
    tx.type !== "ammAddLiquidity" &&
    tx.type !== "ammRemoveLiquidity" &&
    tx.type !== "ammSwap"
  ) {
    throw new Error(`Unsupported AMM transaction type: ${tx.type}`);
  }
  const from = ensureAccount(state, tx.from);
  if (from.nonce !== tx.nonce) {
    throw new Error("Invalid nonce");
  }
  if (tx.type === "ammCreatePool") {
    applyCreatePool(state, tx, from, config);
    return;
  }
  if (tx.type === "ammAddLiquidity") {
    applyAddLiquidity(state, tx, from);
    return;
  }
  if (tx.type === "ammRemoveLiquidity") {
    applyRemoveLiquidity(state, tx, from);
    return;
  }
  applySwap(state, tx, from);
}

function applyCreatePool(
  state: AmmHostState,
  tx: Transaction,
  from: AmmAccount,
  config: NetworkConfig
): void {
  const tokenAssetId = requireUserToken(state, String(tx.payload?.tokenAssetId ?? tx.assetId ?? ""));
  const poolId = nativeLiquidityPoolId(tokenAssetId);
  if (ownGet(state.liquidityPools, poolId)) {
    throw new Error(`Pool already exists: ${poolId}`);
  }
  // M13-1: a manual pool on a token that still has a live bonding curve lets its
  // LPs collect the migration liquidity at a price they picked themselves. From
  // the security-upgrade height on, the only TOKEN/PPL pool for such a token is
  // the one the migration itself writes. Below that height the old rule stands,
  // so historical blocks with manual pools still validate.
  if (securityUpgradeActive(config, currentChainHeight(state) + 1)) {
    const curve = ownGet(state.curves, tokenAssetId);
    if (curve && curve.status !== "migrated") {
      throw new Error("Pool cannot be created while the bonding curve is active");
    }
  }
  const tokenAmount = Number(tx.payload?.tokenAmount ?? 0);
  const nativeAmount = Number(tx.payload?.nativeAmount ?? tx.amount ?? 0);
  const minLpOut = Number(tx.payload?.minLpOut ?? 0);
  if (from.balance < nativeAmount + tx.fee) {
    throw new Error("Insufficient native balance for liquidity and fee");
  }
  if (getBalance(from, tokenAssetId) < tokenAmount) {
    throw new Error("Insufficient token balance for liquidity");
  }
  const height = currentChainHeight(state);
  const pool = emptyPool(poolId, tokenAssetId, height, false);
  const mint = calculateAddLiquidity(pool, tokenAmount, nativeAmount, minLpOut);
  debitFee(from, tx.fee);
  setBalance(from, NATIVE_ASSET_ID, from.balance - nativeAmount);
  setBalance(from, tokenAssetId, getBalance(from, tokenAssetId) - tokenAmount);
  from.nonce += 1;
  applyMintToPool(pool, mint, tx.from);
  state.liquidityPools[poolId] = pool;
}

function applyAddLiquidity(state: AmmHostState, tx: Transaction, from: AmmAccount): void {
  const poolId = resolvePoolId(tx.payload, tx.assetId);
  const pool = state.liquidityPools[poolId];
  if (!pool) {
    throw new Error(`Pool not found: ${poolId}`);
  }
  if (pool.status !== "active") {
    throw new Error("Pool is not active");
  }
  const tokenAssetId = requireUserToken(state, pool.tokenAssetId);
  const tokenAmount = Number(tx.payload?.tokenAmount ?? 0);
  const nativeAmount = Number(tx.payload?.nativeAmount ?? tx.amount ?? 0);
  const minLpOut = Number(tx.payload?.minLpOut ?? 0);
  if (from.balance < nativeAmount + tx.fee) {
    throw new Error("Insufficient native balance for liquidity and fee");
  }
  if (getBalance(from, tokenAssetId) < tokenAmount) {
    throw new Error("Insufficient token balance for liquidity");
  }
  if ((pool.totalLpSupply ?? 0) === 0 && (pool.tokenReserve > 0 || pool.nativeReserve > 0)) {
    bootstrapLpShares(pool);
  }
  const mint = calculateAddLiquidity(pool, tokenAmount, nativeAmount, minLpOut);
  debitFee(from, tx.fee);
  setBalance(from, NATIVE_ASSET_ID, from.balance - nativeAmount);
  setBalance(from, tokenAssetId, getBalance(from, tokenAssetId) - tokenAmount);
  from.nonce += 1;
  applyMintToPool(pool, mint, tx.from);
}

function applyRemoveLiquidity(state: AmmHostState, tx: Transaction, from: AmmAccount): void {
  const poolId = resolvePoolId(tx.payload, tx.assetId);
  const pool = state.liquidityPools[poolId];
  if (!pool) {
    throw new Error(`Pool not found: ${poolId}`);
  }
  if (pool.status !== "active") {
    throw new Error("Pool is not active");
  }
  if ((pool.totalLpSupply ?? 0) === 0 && (pool.tokenReserve > 0 || pool.nativeReserve > 0)) {
    bootstrapLpShares(pool);
  }
  const lpAmount = Number(tx.payload?.lpAmount ?? tx.amount ?? 0);
  const owned = pool.lpBalances?.[tx.from] ?? 0;
  if (lpAmount > owned) {
    throw new Error("Insufficient LP shares");
  }
  const burnResult = calculateRemoveLiquidity(
    pool,
    lpAmount,
    Number(tx.payload?.minTokenOut ?? 0),
    Number(tx.payload?.minNativeOut ?? 0)
  );
  debitFee(from, tx.fee);
  from.nonce += 1;
  pool.lpBalances ??= {};
  pool.lpBalances[tx.from] = owned - lpAmount;
  if (pool.lpBalances[tx.from] === 0) {
    delete pool.lpBalances[tx.from];
  }
  pool.tokenReserve = burnResult.newTokenReserve;
  pool.nativeReserve = burnResult.newNativeReserve;
  pool.totalLpSupply = burnResult.newTotalLpSupply;
  const tokenAssetId = canonicalizeAssetId(pool.tokenAssetId);
  setBalance(from, tokenAssetId, getBalance(from, tokenAssetId) + burnResult.tokenOut);
  setBalance(from, NATIVE_ASSET_ID, from.balance + burnResult.nativeOut);
}

function applySwap(state: AmmHostState, tx: Transaction, from: AmmAccount): void {
  const poolId = resolvePoolId(tx.payload, tx.assetId);
  const pool = state.liquidityPools[poolId];
  if (!pool) {
    throw new Error(`Pool not found: ${poolId}`);
  }
  if (pool.status !== "active") {
    throw new Error("Pool is not active");
  }
  const tokenIn = canonicalizeAssetId(String(tx.payload?.tokenIn ?? ""));
  const tokenOut = canonicalizeAssetId(
    String(tx.payload?.tokenOut ?? (tokenIn === NATIVE_ASSET_ID ? pool.tokenAssetId : NATIVE_ASSET_ID))
  );
  const amountIn = Number(tx.payload?.amountIn ?? tx.amount ?? 0);
  const minAmountOut = Number(tx.payload?.minAmountOut ?? 0);
  const pair = swapReserves(pool, tokenIn, tokenOut);
  const nativeCost = pair.inIsNative ? amountIn + tx.fee : tx.fee;
  if (from.balance < nativeCost) {
    throw new Error("Insufficient native balance for swap and fee");
  }
  if (!pair.inIsNative && getBalance(from, tokenIn) < amountIn) {
    throw new Error("Insufficient token balance for swap");
  }
  const result = calculateAmmSwapExactIn(
    pair.reserveIn,
    pair.reserveOut,
    pair.inIsNative ? nativeUnits(amountIn, pool) : amountIn,
    pool.feeBps,
    pair.inIsNative ? minAmountOut : nativeUnits(minAmountOut, pool)
  );
  debitFee(from, tx.fee);
  if (pair.inIsNative) {
    setBalance(from, NATIVE_ASSET_ID, from.balance - amountIn);
    setBalance(from, tokenOut, getBalance(from, tokenOut) + result.amountOut);
    pool.nativeReserve = nativePpl(result.newReserveIn, pool);
    pool.tokenReserve = result.newReserveOut;
  } else {
    setBalance(from, tokenIn, getBalance(from, tokenIn) - amountIn);
    setBalance(from, NATIVE_ASSET_ID, from.balance + nativePpl(result.amountOut, pool));
    pool.tokenReserve = result.newReserveIn;
    pool.nativeReserve = nativePpl(result.newReserveOut, pool);
  }
  from.nonce += 1;
}
