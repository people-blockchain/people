import { PPL_SCALE, pplToAtoms } from "./ppl-units.js";
import { readSecurityUpgrade, securityUpgradeActive, legacyNetworkConfig, MAX_FUTURE_BLOCK_MS } from "./security-upgrade.js";
import { readConsensusUpgrade1, consensusUpgrade1Active, withoutConsensusUpgrade1 } from "./consensus-upgrade-1.js";
import {
  PROMO_BPS_NONE,
  applyPromoToAllocation,
  awardPromo,
  claimPromo,
  createPromoPool,
  parsePromoBps,
  promoShareActive,
  readPromoShareUpgrade,
  returnUnusedPromo,
  withoutPromoShareUpgrade,
  type PromoPoolState
} from "./promo-share.js";
import { createHash } from "node:crypto";
import type {
  AssetMetadata,
  AssetPoolAccounting,
  AssetStatus,
  AssetType,
  Block,
  BlockHeader,
  CommunityPoolState,
  CreatorClaimPayload,
  CreatorVestingState,
  CurveBuyPayload,
  CurveSellPayload,
  CurveState,
  CurveStatus,
  FeeDistributionDetails,
  FeeSplitConfig,
  FeeSplitResult,
  GovernanceProposal,
  LiquidityPoolState,
  NetworkConfig,
  NftRecord,
  PoolStatus,
  RewardDistribution,
  SlashEvidence,
  TokenAllocation,
  ParticipantState,
  TokenCreatePayload,
  Transaction,
  Validator
} from "@ovn/protocol";
import {
  FAUCET_ADDRESS,
  DEV_FAUCET_PRIVATE_KEY,
  generateKeyPair,
  signTransaction,
  verifyTransaction,
  contentTransactionId,
  signBlock,
  verifyBlockSignature
} from "./crypto.js";
import { maybeApplyEvmAddressMigration, recordTransactionPublicKey } from "./address-policy.js";
import {
  BondingCurveEngine,
  AMM_FEE_BPS,
  CURVE_FEE_BPS,
  VIRTUAL_NATIVE_RESERVE_BASE
} from "./curve.js";
import {
  GROWTH_EPOCH_LENGTH,
  growthEpochOfHeight,
  markNetworkActivity,
  markQualifyingContribution
} from "./growth-qualification.js";
import { growthClaimKey, settleGrowthEpoch, type GrowthClaimRecord } from "./growth-settlement.js";
import {
  LEGACY_NATIVE_ASSET_ID,
  NATIVE_ASSET_ID,
  NATIVE_ASSET_NAME,
  NATIVE_ASSET_SYMBOL,
  canonicalizeAssetId,
  migrateLegacyNativeAssetState,
  nativeLiquidityPoolId,
  ownGet
} from "./native-asset.js";
import {
  deriveNftId,
  getNft as readNft,
  listNfts as readNftList,
  listNftsByOwner as readNftsByOwner,
  nftMintMinFee,
  parseNftMintPayload
} from "./nft.js";
import {
  BATCH_FEE_BASE_PPL,
  BATCH_FEE_CAP_PPL,
  BATCH_FEE_PER_EXTRA_PPL,
  DEFAULT_TRANSFER_FEE_PPL
} from "@ovn/protocol";
import { nftMintMempoolMinFee, tokenCreateMempoolMinFee, tokenCreateMinFee } from "./factory-fees.js";
import {
  applyContractTransaction
} from "./contracts.js";
import {
  applyAmmTransaction,
  mergeMigratedLiquidity
} from "./amm.js";
import { canonicalizeAccounts, canonicalizeContracts } from "./evm.js";
import { contractBlockGasLimit } from "./contract-fees.js";
import { getExecutionEnv, withExecutionEnvAsync } from "./execution-env.js";
import {
  GROWTH_FEE_SPLIT_ACTIVE,
  assertGrowthPoolConservation,
  calculateApprovedFeeSplit,
  createGrowthPoolState,
  growthFeeSplitSwitch,
  listEligibleFeeComponents,
  type ApprovedFeeSplitResult,
  type GrowthPoolState
} from "./growth-pool.js";

export {
  ELIGIBILITY_REASONS,
  GROWTH_EPOCH_LENGTH,
  GROWTH_IDENTITY_METHODS,
  L1_MIN_C,
  L1_MIN_N,
  L1_MIN_SCORE,
  L2_MIN_AGE,
  L2_MIN_C,
  L2_MIN_N,
  L2_MIN_SCORE,
  REFERRAL_MATURATION_EPOCHS,
  SCORE_C_WEIGHT,
  SCORE_CAP,
  SCORE_N_WEIGHT,
  completedEpochsSinceRegistration,
  contributionEpochCount,
  growthEpochEndHeight,
  growthEpochOfHeight,
  growthScore,
  isGrowthIdentityVerified,
  isL1Eligible,
  isL2Eligible,
  lastFullyCompletedEpoch,
  markNetworkActivity,
  markQualifyingContribution,
  networkActivityEpochCount,
  nextEpochEndStrictlyAfter,
  referralMaturedAt,
  type EligibilityReason,
  type EligibilityResult,
  type GrowthIdentityMethod
} from "./growth-qualification.js";
export {
  APPROVED_MODEL_A_SHARES,
  ELIGIBLE_GROWTH_FEE_SOURCES,
  GROWTH_FEE_SPLIT_ACTIVE,
  INELIGIBLE_GROWTH_AMOUNT_SOURCES,
  assertGrowthPoolConservation,
  calculateApprovedFeeSplit,
  createGrowthPoolState,
  creditEligibleFeeBase,
  creditGrowthPool,
  growthFeeSplitSwitch,
  growthPoolAvailable,
  growthPoolTotalDebited,
  listEligibleFeeComponents,
  type ApprovedFeeSplitResult,
  type EligibleFeeComponent,
  type EligibleGrowthFeeSource,
  type FeeBaseInput,
  type GrowthAmountSource,
  type GrowthFeeSplitSwitch,
  type GrowthPoolState,
  type IneligibleGrowthAmountSource
} from "./growth-pool.js";
export {
  LEGACY_NATIVE_ASSET_ID,
  NATIVE_ASSET_ID,
  NATIVE_ASSET_NAME,
  NATIVE_ASSET_SYMBOL,
  USER_PPL_COLLISION_ASSET_ID,
  canonicalizeAssetId,
  migrateLegacyNativeAssetState,
  nativeLiquidityPoolId,
  ownGet
} from "./native-asset.js";
export {
  deriveNftId,
  isAllowedImageUri,
  isValidNftId,
  nftMintMinFee,
  parseNftMintPayload
} from "./nft.js";
export {
  applyContractTransaction,
  getContract,
  listContracts,
  staticContractCall,
  quoteContractFeePpl,
  contractGasPricePpl,
  contractBlockGasLimit
} from "./contracts.js";
export {
  AMM_ACTIVATION_HEIGHT,
  AMM_MINIMUM_LIQUIDITY,
  applyAmmTransaction,
  bootstrapLpShares,
  calculateAddLiquidity,
  calculateAmmSwapExactIn,
  calculateRemoveLiquidity,
  currentChainHeight,
  getLiquidityPool as readLiquidityPool,
  integerSqrt,
  listLiquidityPools,
  mergeMigratedLiquidity,
  quoteAmmSwap,
  toSafeInteger as ammToSafeInteger
} from "./amm.js";
export {
  PROMO_ACCEPTED_BPS,
  PROMO_BPS_HIGH,
  PROMO_BPS_LOW,
  PROMO_BPS_NONE,
  PROMO_MAX_AWARDS_PER_RECIPIENT,
  PROMO_RECIPIENT_CAP_BPS,
  PROMO_UPFRONT_PERCENT,
  PROMO_VESTING_BLOCKS,
  PROMO_WINDOW_BLOCKS,
  applyPromoToAllocation,
  awardPromo,
  claimPromo,
  createPromoPool,
  parsePromoBps,
  promoAmount,
  promoAwardedTo,
  promoClaimableOf,
  promoDeadline,
  promoRecipientCap,
  promoShareActive,
  promoUndistributed,
  promoVestedOf,
  promoVestedOfAward,
  readPromoShareUpgrade,
  requireValidPromoBps,
  returnUnusedPromo,
  withoutPromoShareUpgrade,
  type PromoAward,
  type PromoPoolState
} from "./promo-share.js";
export {
  wrapRuntimeAsDeploy,
  bytesToHex,
  hexToBytes,
  createAddress,
  canonicalizeAccounts,
  canonicalizeContracts,
  pplToWei,
  weiToPpl,
  PEOPLE_EVM_HARDFORK
} from "./evm.js";
export {
  APPROVED_CONTRACT_GAS_PRICE_PPL,
  PROPOSED_CONTRACT_GAS_PRICE_PPL,
  TYPICAL_CONTRACT_DEPLOY_GAS,
  TYPICAL_CONTRACT_DEPLOY_FEE_PPL,
  quoteContractGasFeePpl,
  DEFAULT_TX_GAS_LIMIT,
  MAX_TX_GAS_LIMIT,
  DEFAULT_BLOCK_GAS_LIMIT
} from "./contract-fees.js";
export {
  tokenCreateMinFee,
  tokenCreateMempoolMinFee,
  nftMintMempoolMinFee,
  DEFAULT_NFT_MINT_MIN_FEE,
  DEFAULT_TOKEN_CREATE_MIN_FEE
} from "./factory-fees.js";
export {
  GROWTH_ACTIVE_WEIGHT_SUM,
  GROWTH_CAP_WINDOW,
  GROWTH_CLAIM_EXPIRY_EPOCHS,
  GROWTH_EDGE_CAP_PERCENT,
  GROWTH_L1_WEIGHT,
  GROWTH_L2_WEIGHT,
  GROWTH_MAX_PAID_INVITEES_PER_REFERRER,
  GROWTH_REFERENCE_WINDOW,
  GROWTH_REFERRER_CAP_PERCENT,
  GROWTH_WINDOW_CAP_PERCENT,
  growthClaimKey,
  growthPayableWeight,
  growthRawAmount,
  growthReference,
  settleGrowthEpoch,
  type GrowthClaimRecord,
  type GrowthSettlementResult
} from "./growth-settlement.js";

export interface AccountState {
  balance: number;
  balances: Record<string, number>;
  nonce: number;
}

/** Per-validator attestation ballot at a height (must match an observed block hash). */
export interface AttestationVote {
  weight: number;
  blockHash: string;
}

export interface ChainState {
  accounts: Record<string, AccountState>;
  validators: Record<string, Validator>;
  /** Explicit participants. Not every account is an entry. Not a validator set. */
  participants: Record<string, ParticipantState>;
  /**
   * Distinct Growth Epochs with a qualifying contribution transfer.
   * One epoch is stored once. Not a transaction count.
   */
  contributionEpochs: Record<string, number[]>;
  /**
   * Distinct Growth Epochs with a qualifying token-launch or curve trading fee.
   * One epoch is stored once. A plain transfer does not write this.
   */
  networkActivityEpochs: Record<string, number[]>;
  /** Model A Growth Pool inflow. Escrow is Claimable only; balances are not credited here. */
  growthPool: GrowthPoolState;
  /** Inflow I of each Growth Epoch. Not a budget and not a return. */
  growthEpochInflow: Record<number, number>;
  /** Budget B of each settled Growth Epoch. */
  growthEpochBudget: Record<number, number>;
  /** Final allocation per referrer. Expiry does not reduce this. */
  growthAssigned: Record<number, Record<string, number>>;
  /** Claimable rows. Amount is always greater than 0. */
  growthClaims: Record<string, GrowthClaimRecord>;
  /** Epochs that already ran settlement. */
  growthSettledEpochs: Record<number, true>;
  /**
   * M13-5 part 3 (behind the upgrade): a `settleGrowthEpoch` error at a boundary used to reject
   * the whole block on every node. Deterministic (no fork), but a chain halt. Capped record of
   * boundaries where settlement was skipped instead, for operator visibility.
   */
  growthSettlementFailures?: Array<{ epoch: number; height: number; message: string }>;
  /**
   * Native units of the Model A liquidity & ecosystem share.
   * Separate from per-asset project-token reserves.
   */
  feeLiquidityEcosystem: number;
  /** Fees actually paid by included transactions, never pending submissions. */
  pendingValidatorFees?: number;
  lastEpochReward?: RewardDistribution;
  networkConfig?: NetworkConfig;
  appliedSlashEvidence?: Record<string, boolean>;
  mempool: Transaction[];
  chain: Block[];
  epoch: number;
  proposals: Record<string, GovernanceProposal>;
  attestationVotes: Record<number, Record<string, AttestationVote>>;
  /** Ballots keyed by `${height}:${validator}:${blockHash}` for conflicting-attestation proofs. */
  attestationBallots: Record<string, true>;
  finalizedHeight: number;
  seenBlockHashes: Record<string, string>;
  missedProposalCount?: number;
  stateRevision?: number;
  assets: Record<string, AssetMetadata>;
  communityPool: CommunityPoolState;
  treasury?: Record<string, number>;
  burned?: Record<string, number>;
  curves: Record<string, CurveState>;
  vesting: Record<string, CreatorVestingState>;
  liquidityReserves: Record<string, number>;
  ecosystemReserves: Record<string, number>;
  launchReserves: Record<string, number>;
  liquidityPools: Record<string, LiquidityPoolState>;
  /** Unique NFTs. Empty on nodes that have never minted. Hashed in stateRoot. */
  nfts: Record<string, NftRecord>;
  /** EVM contracts. Hashed in stateRoot. Coordinated node upgrade required. */
  contracts: Record<string, import("@ovn/protocol").ContractAccount>;
  /** Execution receipts/logs. Not hashed in stateRoot. */
  contractReceipts?: Record<string, import("@ovn/protocol").ContractReceipt>;
  /** Submitted source/ABI. Not hashed in stateRoot. */
  contractMeta?: Record<string, { deployTxId: string; source?: Record<string, unknown> }>;
  /** legacy sha256 address → Ethereum canonical (policy 0a). Not hashed in stateRoot. */
  legacyToCanonical?: Record<string, string>;
  /** Set after `applyEvmAddressMigration` at activation height. Not hashed in stateRoot. */
  evmAddressMigrationApplied?: boolean;
  /** Address (any form) → secp256k1 public key hex. Not hashed in stateRoot. */
  knownAccountPublicKeys?: Record<string, string>;
  /**
   * Optional creator promo pools, keyed by asset id (`docs/TOKEN-ECONOMY.md` §4a). The node-side
   * equivalent of `PromoRewardsVault`: promo tokens live here, never in the creator's account.
   * Hashed in `computeStateRoot` **only while non-empty**, so a chain that has never launched a
   * token with a promo share keeps byte-identical state roots.
   */
  promoPools?: Record<string, PromoPoolState>;
}

export const GENESIS_FAUCET_BALANCE = 1_000_000;

export const NATIVE_ASSET: AssetMetadata = {
  assetId: NATIVE_ASSET_ID,
  type: "native",
  name: NATIVE_ASSET_NAME,
  symbol: NATIVE_ASSET_SYMBOL,
  decimals: 6,
  totalSupply: GENESIS_FAUCET_BALANCE,
  creator: "genesis",
  status: "active"
};

export const PROVISIONAL_FEE_SPLIT: FeeSplitConfig = {
  validatorShare: 40,
  communityShare: 25,
  treasuryShare: 20,
  liquidityShare: 10,
  burnShare: 5
};

export const LEGACY_FEE_SPLIT: FeeSplitConfig = {
  validatorShare: 100,
  communityShare: 0,
  treasuryShare: 0,
  liquidityShare: 0,
  burnShare: 0
};

/**
 * M04-1: a balance that is not a finite, non-negative number must never reach
 * state — JSON snapshots turn `NaN` into `null`, so a node would value the next
 * transfer of that sender differently after a restart and fork off the network.
 */
function requireBalance(next: number, assetId: string): number {
  if (!Number.isFinite(next) || next < 0) {
    throw new Error(`Invalid resulting balance for asset: ${assetId}`);
  }
  return next;
}

export function getAccountBalance(account: AccountState, assetId: string = NATIVE_ASSET_ID): number {
  const id = canonicalizeAssetId(assetId);
  if (id === NATIVE_ASSET_ID) {
    return account.balance;
  }
  return ownGet(account.balances, id) ?? 0;
}

export function setAccountBalance(account: AccountState, assetId: string, amount: number): void {
  const id = canonicalizeAssetId(assetId);
  account.balances ??= { [NATIVE_ASSET_ID]: account.balance ?? 0 };
  account.balances[id] = amount;
  if (id === NATIVE_ASSET_ID) {
    account.balance = amount;
  }
}

export function getAllBalances(account: AccountState): Record<string, number> {
  account.balances ??= { [NATIVE_ASSET_ID]: account.balance ?? 0 };
  return { ...account.balances, [NATIVE_ASSET_ID]: account.balance };
}

export function isValidAssetId(assetId: string): boolean {
  if (typeof assetId !== "string") {
    return false;
  }
  const normalized = assetId.trim().toLowerCase();
  // M04-1: must start with a letter or a digit, so `__proto__` is out, and must
  // not collide with an inherited Object.prototype key (`constructor`).
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(normalized)) {
    return false;
  }
  return !Object.hasOwn(Object.prototype, normalized);
}

export function registerAsset(state: ChainState, asset: AssetMetadata): void {
  if (!isValidAssetId(asset.assetId)) {
    throw new Error(`Invalid asset ID format: ${asset.assetId}`);
  }
  const id = canonicalizeAssetId(asset.assetId);
  if (id === NATIVE_ASSET_ID && state.assets[NATIVE_ASSET_ID]) {
    throw new Error(`Asset already registered: ${id}`);
  }
  if (state.assets[id]) {
    throw new Error(`Asset already registered: ${id}`);
  }
  if (!Number.isSafeInteger(asset.decimals) || asset.decimals < 0 || asset.decimals > 18) {
    throw new Error("Decimals must be an integer between 0 and 18");
  }
  if (!Number.isFinite(asset.totalSupply) || asset.totalSupply < 0) {
    throw new Error("Total supply must be non-negative");
  }
  state.assets[id] = {
    ...asset,
    assetId: id
  };
}

export function getAsset(state: ChainState, assetId: string): AssetMetadata | undefined {
  return ownGet(state.assets, canonicalizeAssetId(assetId));
}

export function listAssets(state: ChainState): AssetMetadata[] {
  return Object.values(state.assets);
}

export function getNft(state: ChainState, nftId: string) {
  return readNft(state.nfts, nftId);
}

export function listNfts(state: ChainState) {
  return readNftList(state.nfts);
}

export function listOwnedNfts(state: ChainState, owner: string) {
  return readNftsByOwner(state.nfts, owner);
}

export class FeeSplitter {
  static validateConfig(config: FeeSplitConfig): void {
    const shares = [
      config.validatorShare,
      config.communityShare,
      config.treasuryShare,
      config.liquidityShare,
      config.burnShare
    ];
    for (const s of shares) {
      if (!Number.isSafeInteger(s) || s < 0) {
        throw new Error("Fee shares must be non-negative safe integers");
      }
    }
    const sum = shares.reduce((a, b) => a + b, 0);
    if (sum !== 100) {
      throw new Error(`Fee shares must sum to 100 (got ${sum})`);
    }
  }

  static split(totalFee: number, config: FeeSplitConfig = LEGACY_FEE_SPLIT): FeeSplitResult {
    if (!Number.isFinite(totalFee) || totalFee < 0) {
      throw new Error("Invalid total fee");
    }
    FeeSplitter.validateConfig(config);
    if (totalFee === 0) {
      return {
        validatorAmount: 0,
        communityAmount: 0,
        treasuryAmount: 0,
        liquidityAmount: 0,
        burnAmount: 0,
        total: 0
      };
    }

    if (Number.isSafeInteger(totalFee)) {
      const feeInt = BigInt(totalFee);
      const c = Number((feeInt * BigInt(config.communityShare)) / 100n);
      const t = Number((feeInt * BigInt(config.treasuryShare)) / 100n);
      const l = Number((feeInt * BigInt(config.liquidityShare)) / 100n);
      const b = Number((feeInt * BigInt(config.burnShare)) / 100n);
      const v = totalFee - (c + t + l + b);
      return {
        validatorAmount: v,
        communityAmount: c,
        treasuryAmount: t,
        liquidityAmount: l,
        burnAmount: b,
        total: totalFee
      };
    }

    // Decimal fallback for non-integer tx.fee (e.g. Solana-aligned 0.004875 PPL transfer)
    const c = Math.floor(totalFee * (config.communityShare / 100) * 1e6) / 1e6;
    const t = Math.floor(totalFee * (config.treasuryShare / 100) * 1e6) / 1e6;
    const l = Math.floor(totalFee * (config.liquidityShare / 100) * 1e6) / 1e6;
    const b = Math.floor(totalFee * (config.burnShare / 100) * 1e6) / 1e6;
    const v = Math.round((totalFee - (c + t + l + b)) * 1e6) / 1e6;
    return {
      validatorAmount: v,
      communityAmount: c,
      treasuryAmount: t,
      liquidityAmount: l,
      burnAmount: b,
      total: totalFee
    };
  }
}

export function createInitialCommunityPoolState(): CommunityPoolState {
  return { pools: {} };
}

export function getCommunityPoolAccounting(
  poolState: CommunityPoolState,
  assetId: string
): AssetPoolAccounting {
  const id = canonicalizeAssetId(assetId);
  if (!poolState.pools[id]) {
    poolState.pools[id] = {
      assetId: id,
      totalAllocated: 0,
      totalDistributed: 0,
      remainingBalance: 0
    };
  }
  return poolState.pools[id]!;
}

export function allocateToCommunityPool(
  poolState: CommunityPoolState,
  assetId: string,
  amount: number
): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Allocation amount must be positive");
  }
  const pool = getCommunityPoolAccounting(poolState, assetId);
  pool.totalAllocated += amount;
  pool.remainingBalance += amount;
}

export function distributeFromCommunityPool(
  poolState: CommunityPoolState,
  assetId: string,
  amount: number
): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Distribution amount must be positive");
  }
  const pool = getCommunityPoolAccounting(poolState, assetId);
  if (amount > pool.remainingBalance) {
    throw new Error("Insufficient community pool balance");
  }
  pool.totalDistributed += amount;
  pool.remainingBalance -= amount;
}

export const DEFAULT_CONFIG: NetworkConfig = {
  ...(readSecurityUpgrade(process.env) ? { securityUpgrade: readSecurityUpgrade(process.env) } : {}),
  ...(readConsensusUpgrade1(process.env) ? { consensusUpgrade1: readConsensusUpgrade1(process.env) } : {}),
  ...(readPromoShareUpgrade(process.env) ? { promoShareUpgrade: readPromoShareUpgrade(process.env) } : {}),
  bootstrapAddress: process.env.BOOTSTRAP_ADDRESS ?? "",
  chainId: process.env.CHAIN_ID ?? "ovn-devnet",
  minStake: 100,
  warmupEpochs: 2,
  unbondingEpochs: 2,
  lightValidatorWeightMultiplier: 0.5,
  epochBaseIssuance: 50,
  attestationFinalityThreshold: 0.67,
  referralShare: 0.05
};

export const SLASH_FRACTION = 0.25;
export const SLASH_REPORTER_SHARE = 0.1;
export const SLASH_JAIL_EPOCHS = 5;

export const MAX_TRANSACTIONS_PER_BLOCK = 100;
export const DEFAULT_BLOCK_INTERVAL_MS = 3000;
/** How many recent blocks to keep in RAM / snapshot / disk indexes. */
export const CHAIN_WINDOW_BLOCKS = Number(process.env.CHAIN_WINDOW_BLOCKS ?? 500);
/** Keep this many recent checkpoints on disk. */
export const CHECKPOINT_KEEP = Number(process.env.CHECKPOINT_KEEP ?? 5);
export const CHECKPOINT_INTERVAL = 100;

export function computeMaxThroughputTps(
  maxTxPerBlock = MAX_TRANSACTIONS_PER_BLOCK,
  blockIntervalMs = DEFAULT_BLOCK_INTERVAL_MS
): number {
  if (blockIntervalMs <= 0) {
    return 0;
  }
  return maxTxPerBlock / (blockIntervalMs / 1000);
}

export function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** Each coordinated fork is stripped from the hashed config until its own height arrives. */
function normalizedNetworkConfigForRoot(config: NetworkConfig, height: number): NetworkConfig {
  let normalized = config;
  if (!securityUpgradeActive(normalized, height)) normalized = legacyNetworkConfig(normalized);
  if (!consensusUpgrade1Active(normalized, height)) normalized = withoutConsensusUpgrade1(normalized);
  if (!promoShareActive(normalized, height)) normalized = withoutPromoShareUpgrade(normalized);
  return normalized;
}

export function computeStateRoot(state: ChainState): string {
  return hashJson({
    accounts: canonicalizeAccounts(state.accounts),
    validators: state.validators,
    participants: state.participants,
    contributionEpochs: state.contributionEpochs,
    networkActivityEpochs: state.networkActivityEpochs,
    growthPool: state.growthPool,
    growthEpochInflow: state.growthEpochInflow,
    growthEpochBudget: state.growthEpochBudget,
    growthAssigned: state.growthAssigned,
    growthClaims: state.growthClaims,
    growthSettledEpochs: state.growthSettledEpochs,
    feeLiquidityEcosystem: state.feeLiquidityEcosystem,
    treasury: state.treasury,
    burned: state.burned,
    pendingValidatorFees: state.pendingValidatorFees ?? 0,
    networkConfig: state.networkConfig && normalizedNetworkConfigForRoot(state.networkConfig, getExecutionEnv()?.blockNumber ?? state.chain.at(-1)?.header.height ?? 0),
    appliedSlashEvidence: state.appliedSlashEvidence ?? {},
    epoch: state.epoch,
    proposals: state.proposals,
    finalizedHeight: state.finalizedHeight,
    assets: state.assets,
    communityPool: state.communityPool,
    curves: state.curves,
    vesting: state.vesting,
    liquidityReserves: state.liquidityReserves,
    ecosystemReserves: state.ecosystemReserves,
    launchReserves: state.launchReserves,
    liquidityPools: state.liquidityPools,
    nfts: state.nfts ?? {},
    contracts: canonicalizeContracts(state.contracts ?? {}),
    // Appended last and only when a promo pool exists: a chain with no promo launch hashes the
    // exact same object as the pre-promo-share binary, so historical state roots are unchanged.
    ...(state.promoPools && Object.keys(state.promoPools).length > 0 ? { promoPools: state.promoPools } : {})
  });
}

export function createGenesisBlock(config: NetworkConfig = DEFAULT_CONFIG): Block {
  const header: BlockHeader = {
    height: 0,
    previousHash: "GENESIS",
    // A coordinated activation height is a schedule, not genesis identity: scheduling the promo
    // share on a live network must not move the genesis hash, or every node would fail the
    // `EXPECTED_GENESIS_HASH` check and refuse to rejoin its own chain. Stripping an absent field
    // is a no-op, so this is byte-identical on a network that never schedules one.
    // NOTE: `consensusUpgrade1` is deliberately left in here. It is already part of the genesis
    // hash on any network that scheduled it, and removing it now would move that network's
    // genesis — a separate coordinated change, not this one's to make.
    stateRoot: hashJson({ config: withoutPromoShareUpgrade(legacyNetworkConfig(config)), faucet: FAUCET_ADDRESS, balance: GENESIS_FAUCET_BALANCE, tokenCreateMinFee: tokenCreateMinFee(), nftMintMinFee: nftMintMinFee() }),
    chainId: config.chainId,
    protocolVersion: 2,
    proposer: "genesis",
    timestamp: 0
  };
  return {
    header,
    transactions: [],
    hash: hashJson(header)
  };
}

export function createInitialState(config: NetworkConfig = DEFAULT_CONFIG): ChainState {
  return {
    networkConfig: structuredClone(config),
    accounts: {
      [FAUCET_ADDRESS]: {
        balance: GENESIS_FAUCET_BALANCE,
        balances: { [NATIVE_ASSET_ID]: GENESIS_FAUCET_BALANCE },
        nonce: 0
      }
    },
    validators: {},
    participants: {},
    contributionEpochs: {},
    networkActivityEpochs: {},
    growthPool: createGrowthPoolState(),
    growthEpochInflow: {},
    growthEpochBudget: {},
    growthAssigned: {},
    growthClaims: {},
    growthSettledEpochs: {},
    feeLiquidityEcosystem: 0,
    mempool: [],
    chain: [createGenesisBlock(config)],
    epoch: 0,
    proposals: {},
    attestationVotes: {},
    attestationBallots: {},
    finalizedHeight: 0,
    seenBlockHashes: {},
    missedProposalCount: 0,
    assets: {
      [NATIVE_ASSET_ID]: { ...NATIVE_ASSET }
    },
    communityPool: createInitialCommunityPoolState(),
    treasury: { [NATIVE_ASSET_ID]: 0 },
    burned: { [NATIVE_ASSET_ID]: 0 },
    curves: {},
    vesting: {},
    liquidityReserves: {},
    ecosystemReserves: {},
    launchReserves: {},
    liquidityPools: {},
    nfts: {},
    contracts: {},
    contractReceipts: {},
    contractMeta: {},
    promoPools: {}
  };
}

const MAX_TRANSFER_MEMO_LENGTH = 256;
export const MAX_BATCH_RECIPIENTS = 50;
export const BATCH_FEE_BASE = BATCH_FEE_BASE_PPL;
export const BATCH_FEE_PER_EXTRA = BATCH_FEE_PER_EXTRA_PPL;
export const BATCH_FEE_CAP = BATCH_FEE_CAP_PPL;
export const DEFAULT_TRANSFER_FEE = DEFAULT_TRANSFER_FEE_PPL;
const MAX_MEMPOOL_SIZE = Number(process.env.MEMPOOL_MAX_SIZE ?? 10_000);

/** Onboarding transactions are fee-0 by rule and are never evicted to make room. */
function isOnboardingTx(tx: Transaction): boolean {
  return tx.type === "registerParticipant" || tx.type === "participantReferral";
}

/**
 * Node-local mempool admission (`state.mempool` is not part of `computeStateRoot`, and blocks
 * carry only the transactions they include, so this is not a consensus rule).
 *
 * A full mempool replaces its cheapest evictable transaction rather than rejecting the
 * newcomer outright, but only when the newcomer pays strictly more — otherwise a
 * minimum-fee flood could push out everything that pays, and an onboarding transaction
 * (fee 0 by rule) could never make room for real value transfer.
 */
function admitToMempool(state: ChainState, tx: Transaction): void {
  if (state.mempool.length < MAX_MEMPOOL_SIZE) {
    state.mempool.push(tx);
    return;
  }
  let victimIndex = -1;
  for (let i = 0; i < state.mempool.length; i += 1) {
    const candidate = state.mempool[i]!;
    if (isOnboardingTx(candidate)) continue;
    if (victimIndex < 0 || candidate.fee < state.mempool[victimIndex]!.fee) victimIndex = i;
  }
  if (victimIndex < 0 || !(tx.fee > state.mempool[victimIndex]!.fee)) {
    throw new Error("Mempool is full");
  }
  state.mempool.splice(victimIndex, 1);
  state.mempool.push(tx);
}

export interface BatchRecipient {
  to: string;
  amount: number;
  memo?: string;
}

export function suggestedBatchFee(recipientCount: number): number {
  const n = Math.max(1, recipientCount);
  return Math.min(BATCH_FEE_CAP, BATCH_FEE_BASE + BATCH_FEE_PER_EXTRA * Math.max(0, n - 1));
}

/** Network-aware transfer fee tip from pending mempool pressure. */
export function suggestedTransferFee(mempool: Transaction[]): number {
  const transferFees = mempool
    .filter((tx) => tx.type === "transfer" && Number.isFinite(tx.fee) && tx.fee > 0)
    .map((tx) => tx.fee)
    .sort((a, b) => a - b);

  let fee = DEFAULT_TRANSFER_FEE;
  if (transferFees.length > 0) {
    const median = transferFees[Math.floor(transferFees.length / 2)]!;
    // Slightly above median so the tip competes in fee-priority ordering.
    fee = Math.max(DEFAULT_TRANSFER_FEE, Math.round(median * 1.05 * 1000) / 1000);
  }

  const size = mempool.length;
  if (size >= 200) {
    fee = Math.max(fee, Math.round(DEFAULT_TRANSFER_FEE * 2.5 * 1000) / 1000);
  } else if (size >= 50) {
    fee = Math.max(fee, Math.round(DEFAULT_TRANSFER_FEE * 1.5 * 1000) / 1000);
  }

  return fee;
}

export function compareMempoolPriority(a: Transaction, b: Transaction): number {
  if (b.fee !== a.fee) {
    return b.fee - a.fee;
  }
  if (a.timestamp !== b.timestamp) {
    return a.timestamp - b.timestamp;
  }
  return a.id.localeCompare(b.id);
}

function isRecoverableMempoolError(message: string): boolean {
  return /nonce|insufficient|not finished|unbonding period|jailed|unknown proposal|already voted|not a participant|block gas/i.test(
    message
  );
}

export function getBatchRecipients(tx: Pick<Transaction, "payload" | "type">): BatchRecipient[] | null {
  if (tx.type !== "transfer") {
    return null;
  }
  const raw = tx.payload?.recipients;
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }
  try {
    return parseBatchRecipients(raw);
  } catch {
    return null;
  }
}

function normalizeOptionalMemo(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error("Invalid memo");
  }
  if (value.length > MAX_TRANSFER_MEMO_LENGTH) {
    throw new Error("Memo too long");
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseBatchRecipients(raw: unknown): BatchRecipient[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("Batch recipients required");
  }
  if (raw.length > MAX_BATCH_RECIPIENTS) {
    throw new Error(`Too many recipients (max ${MAX_BATCH_RECIPIENTS})`);
  }
  const recipients: BatchRecipient[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      throw new Error("Invalid batch recipient");
    }
    const entry = item as { to?: unknown; amount?: unknown; memo?: unknown };
    const to = typeof entry.to === "string" ? entry.to.trim() : "";
    const amount = Number(entry.amount);
    if (!isCanonicalAddress(to)) {
      throw new Error("Invalid batch recipient address");
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Invalid batch recipient amount");
    }
    const memo = normalizeOptionalMemo(entry.memo);
    recipients.push(memo ? { to, amount, memo } : { to, amount });
  }
  return recipients;
}

export function enqueueTransaction(state: ChainState, tx: Transaction, verify = true): void {
  validateTransactionValues(tx);
  if (state.networkConfig && consensusUpgrade1Active(state.networkConfig, inclusionBlockHeight(state)) && !isCanonicalCaseTransaction(tx)) {
    throw new Error("Address, public key and signature must be lowercase hex");
  }
  if (Buffer.byteLength(JSON.stringify(tx)) > 65_536) throw new Error("Transaction exceeds mempool size limit");
  if (tx.chainId !== (state.networkConfig?.chainId ?? DEFAULT_CONFIG.chainId)) throw new Error("Wrong transaction chainId");
  if (state.mempool.some((pending) => pending.id === tx.id)) throw new Error("Duplicate transaction");
  if (verify && !verifyTransaction(tx)) {
    throw new Error("Invalid transaction signature");
  }
  if ((tx.type === "registerParticipant" || tx.type === "participantReferral") && (tx.amount !== 0 || tx.fee !== 0)) throw new Error("Participant transaction must not move value");
  if (state.mempool.some(pending => pending.from === tx.from)) throw new Error("Sender already has a pending transaction");
  validateMempoolSpending(state, tx);
  // Node-local promo-share admission. `applyTokenCreate` deliberately *ignores* `promoBps` below
  // the coordinated activation height (so a pre-upgrade binary and this one replay identically);
  // refusing the transaction here instead gives the creator an explicit error rather than a
  // silent 0% promo share. Above the height the value is validated eagerly, at submit time.
  // The three pool transactions get the same treatment: `applyPromoTransaction` rejects them
  // below the height anyway, so refusing admission only moves the error to submit time and keeps
  // a hopeless transaction out of the sender's single mempool slot.
  if (
    (tx.type === "tokenCreate" && tx.payload?.promoBps !== undefined && tx.payload.promoBps !== null) ||
    tx.type === "promoAward" ||
    tx.type === "promoClaim" ||
    tx.type === "promoReturn"
  ) {
    const promoLive = Boolean(
      state.networkConfig && promoShareActive(state.networkConfig, inclusionBlockHeight(state))
    );
    if (!promoLive) {
      throw new Error("Creator promo share is not active on this network yet");
    }
    if (tx.type === "tokenCreate") parsePromoBps(tx.payload, true);
  }
  if (state.networkConfig && securityUpgradeActive(state.networkConfig, inclusionBlockHeight(state)) && tx.id !== contentTransactionId(tx)) throw new Error("Transaction ID must match signed content");
  if (tx.type === "registerParticipant" || tx.type === "participantReferral") {
    if (tx.amount !== 0 || tx.fee !== 0) {
      throw new Error("Participant transaction must not move value");
    }
    if (!isCanonicalAddress(tx.from)) {
      throw new Error("Malformed participant address");
    }
    const existing = state.accounts[tx.from];
    if (tx.nonce !== (existing?.nonce ?? 0)) {
      throw new Error("Invalid nonce");
    }
    if (tx.type === "participantReferral" && !state.participants[tx.from]) {
      throw new Error("Child is not a participant");
    }
    admitToMempool(state, tx);
    return;
  }
  validateTransferMemo(tx);
  validateBatchTransfer(
    tx,
    Boolean(
      state.networkConfig &&
        securityUpgradeActive(state.networkConfig, inclusionBlockHeight(state))
    )
  );
  if (tx.nonce !== (state.accounts[tx.from]?.nonce ?? 0)) {
    throw new Error("Invalid nonce");
  }
  admitToMempool(state, tx);
}

/** Cheap local admission checks. Block replay deliberately does not use node mempool policy. */
export function validateMempoolSpending(state: ChainState, tx: Transaction, publicTariffs = false): void {
  const account = state.accounts[tx.from];
  let availableNative = account?.balance ?? 0;
  let nativeCost = tx.fee;
  let tokenCost = 0;
  let assetId = canonicalizeAssetId(String(tx.assetId ?? tx.payload?.assetId ?? NATIVE_ASSET_ID));
  if (tx.type === "transfer") {
    if (tx.amount <= 0) throw new Error("Invalid transfer amount");
    if (publicTariffs && tx.fee < DEFAULT_TRANSFER_FEE) throw new Error("Transfer fee is below the public mempool tariff");
    if (!ownGet(state.assets, assetId)) throw new Error("Asset not found");
    if (assetId === NATIVE_ASSET_ID) nativeCost += tx.amount;
    else {
      if (!Number.isSafeInteger(tx.amount)) throw new Error("Token amount must be an integer base unit");
      tokenCost = tx.amount;
    }
  } else if (tx.type === "joinValidator" || tx.type === "contractCall" || tx.type === "contractDeploy") {
    nativeCost += tx.amount;
  } else if (tx.type === "curveBuy") {
    nativeCost += Number(tx.payload?.nativeAmount ?? tx.payload?.nativeIn ?? tx.amount);
  } else if (tx.type === "curveSell") {
    tokenCost = Number(tx.payload?.tokenAmount ?? tx.payload?.tokensIn ?? tx.amount);
  } else if (tx.type === "tokenCreate" && tx.fee < tokenCreateMempoolMinFee()) {
    // M13-4: this node's own admission floor (env may raise it); the block-apply floor is the
    // constant `tokenCreateMinFee()`.
    throw new Error("Token launch fee is below the public tariff");
  } else if (tx.type === "nftMint" && tx.fee < nftMintMempoolMinFee()) {
    throw new Error("NFT mint fee is below the public tariff");
  } else if (tx.type === "ammCreatePool" || tx.type === "ammAddLiquidity") {
    const pool = ownGet(state.liquidityPools, String(tx.payload?.poolId ?? ""));
    assetId = canonicalizeAssetId(String(tx.payload?.tokenAssetId ?? pool?.tokenAssetId ?? tx.assetId ?? ""));
    tokenCost = Number(tx.payload?.tokenAmount ?? 0);
    nativeCost += Number(tx.payload?.nativeAmount ?? tx.amount);
  } else if (tx.type === "ammSwap") {
    assetId = canonicalizeAssetId(String(tx.payload?.tokenIn ?? ""));
    const input = Number(tx.payload?.amountIn ?? tx.amount);
    if (assetId === NATIVE_ASSET_ID) nativeCost += input;
    else tokenCost = input;
  }
  if (!Number.isFinite(nativeCost) || nativeCost < 0 || !Number.isFinite(tokenCost) || tokenCost < 0) throw new Error("Invalid pending transaction cost");
  let availableToken = ownGet(account?.balances, assetId) ?? 0;
  // Preserve the existing fund-then-join path. Only count funded, pending transfers;
  // never count this sender's own spending or cyclic loans from empty accounts.
  for (const pending of state.mempool) {
    if (pending.type !== "transfer" || pending.from === tx.from) continue;
    const pendingAsset = canonicalizeAssetId(String(pending.assetId ?? pending.payload?.assetId ?? NATIVE_ASSET_ID));
    const sender = state.accounts[pending.from];
    if (!sender || sender.balance < pending.fee + (pendingAsset === NATIVE_ASSET_ID ? pending.amount : 0)) continue;
    if (pendingAsset !== NATIVE_ASSET_ID && (ownGet(sender.balances, pendingAsset) ?? 0) < pending.amount) continue;
    const recipients = pending.payload?.recipients === undefined ? [{ to: pending.to, amount: pending.amount }] : parseBatchRecipients(pending.payload.recipients);
    const credit = recipients.filter(recipient => recipient.to === tx.from).reduce((sum, recipient) => sum + recipient.amount, 0);
    if (pendingAsset === NATIVE_ASSET_ID) availableNative += credit;
    else if (pendingAsset === assetId) availableToken += credit;
  }
  if (availableNative < nativeCost) throw new Error("Insufficient native balance for pending transaction");
  if (availableToken < tokenCost) throw new Error("Insufficient token balance for pending transaction");
}

function validateTransferMemo(tx: Transaction): void {
  if (tx.type !== "transfer") {
    return;
  }
  // Batch: memo belongs to each payment, not the whole transaction.
  if (tx.payload?.recipients !== undefined) {
    if (tx.payload.memo !== undefined) {
      throw new Error("Batch memo must be set per recipient");
    }
    return;
  }
  if (tx.payload?.memo === undefined) {
    return;
  }
  normalizeOptionalMemo(tx.payload.memo);
}

function isNativeTransferAsset(tx: Transaction): boolean {
  const raw = tx.assetId ?? (tx.payload?.assetId as string | undefined) ?? NATIVE_ASSET_ID;
  return canonicalizeAssetId(raw) === NATIVE_ASSET_ID;
}

/**
 * M04-2 / M04-4 (behind the security upgrade): every leg of a batch must be representable in
 * the same units a single transfer allows — integer base units for a token, six decimal places
 * for native PPL (`pplToAtoms`, the same bound already applied to fees). Without this, legs of
 * 0.5 token each summed to an integer total and credited fractional token balances.
 */
function validateBatchTransfer(tx: Transaction, upgraded: boolean): BatchRecipient[] | null {
  if (tx.type !== "transfer" || tx.payload?.recipients === undefined) {
    return null;
  }
  const recipients = parseBatchRecipients(tx.payload.recipients);
  if (upgraded) {
    const native = isNativeTransferAsset(tx);
    for (const item of recipients) {
      if (native) {
        pplToAtoms(item.amount);
      } else if (!Number.isSafeInteger(item.amount)) {
        throw new Error("Batch token amount must be an integer base unit");
      }
    }
  }
  const total = recipients.reduce((sum, item) => sum + item.amount, 0);
  if (Math.abs(total - tx.amount) > 1e-9) {
    throw new Error("Batch amount mismatch");
  }
  return recipients;
}

export function ensureAccount(state: ChainState, address: string): AccountState {
  if (!state.accounts[address]) {
    state.accounts[address] = {
      balance: 0,
      balances: { [NATIVE_ASSET_ID]: 0 },
      nonce: 0
    };
  } else {
    const acct = state.accounts[address]!;
    if (!acct.balances) {
      acct.balances = { [NATIVE_ASSET_ID]: acct.balance ?? 0 };
    }
  }
  return state.accounts[address]!;
}

function cloneAccounts(state: ChainState): Record<string, AccountState> {
  return Object.fromEntries(
    Object.entries(state.accounts).map(([address, account]) => [
      address,
      { ...account, balances: { ...account.balances } }
    ])
  );
}

function cloneValidators(state: ChainState): Record<string, Validator> {
  return Object.fromEntries(
    Object.entries(state.validators).map(([address, validator]) => [address, { ...validator }])
  );
}

/** Approved max participant-referral depth (L1/L2 only). Depth greater than this is rejected, never clamped. */
export const MAX_PARTICIPANT_REFERRAL_DEPTH = 2;

const CANONICAL_ADDRESS = /^0x[0-9a-f]{40}$/;

export function isCanonicalAddress(address: string): boolean {
  return CANONICAL_ADDRESS.test(address);
}

/**
 * Edges from `address` up to a root. A root is 0. Not stored.
 * Throws if a cycle is already present. Returns a value greater than
 * MAX_PARTICIPANT_REFERRAL_DEPTH when a stored chain is already too deep.
 */
export function derivedParticipantDepth(
  participants: Record<string, ParticipantState>,
  address: string
): number {
  let depth = 0;
  let current: string | undefined = address;
  const seen = new Set<string>();
  while (current && participants[current]?.parent) {
    if (seen.has(current)) {
      throw new Error("Participant referral cycle");
    }
    seen.add(current);
    current = participants[current]!.parent;
    depth += 1;
    if (depth > MAX_PARTICIPANT_REFERRAL_DEPTH) {
      return depth;
    }
  }
  return depth;
}

/**
 * Depth the child would have if `parent` were accepted.
 * Rejects self, cycles, and depth > MAX_PARTICIPANT_REFERRAL_DEPTH. Does not write state.
 */
export function participantEdgeDepth(
  participants: Record<string, ParticipantState>,
  child: string,
  parent: string
): number {
  if (child === parent) {
    throw new Error("Self-referral is not allowed");
  }
  let hopsFromParentToRoot = 0;
  let current: string | undefined = parent;
  const seen = new Set<string>();
  while (current) {
    if (current === child || seen.has(current)) {
      throw new Error("Participant referral cycle");
    }
    seen.add(current);
    const next: string | undefined = participants[current]?.parent;
    if (!next) {
      break;
    }
    hopsFromParentToRoot += 1;
    if (hopsFromParentToRoot > MAX_PARTICIPANT_REFERRAL_DEPTH) {
      throw new Error(`Participant referral depth exceeds ${MAX_PARTICIPANT_REFERRAL_DEPTH}`);
    }
    current = next;
  }
  const depth = hopsFromParentToRoot + 1;
  if (depth > MAX_PARTICIPANT_REFERRAL_DEPTH) {
    throw new Error(`Participant referral depth exceeds ${MAX_PARTICIPANT_REFERRAL_DEPTH}`);
  }
  return depth;
}

/**
 * Height of the block that is applying this transition.
 * buildBlock and tryApplyRemoteBlock both apply transactions before pushing
 * the block, so the tip is still the parent block.
 */
export function inclusionBlockHeight(state: ChainState): number {
  const head = state.chain[state.chain.length - 1];
  if (!head || !Number.isSafeInteger(head.header.height) || head.header.height < 0) {
    throw new Error("Invalid block height");
  }
  const height = head.header.height + 1;
  if (!Number.isSafeInteger(height) || height < 1) {
    throw new Error("Invalid block height");
  }
  return height;
}

/**
 * Participant registration and the referral edge.
 * No balance movement, no validator mutation, no reward.
 * Validation finishes before any write so a reject leaves state unchanged.
 */
function applyParticipantTransaction(state: ChainState, tx: Transaction): void {
  if (tx.amount !== 0 || tx.fee !== 0) {
    throw new Error("Participant transaction must not move value");
  }
  if (!isCanonicalAddress(tx.from)) {
    throw new Error("Malformed participant address");
  }
  const existing = state.accounts[tx.from];
  if (tx.nonce !== (existing?.nonce ?? 0)) {
    throw new Error("Invalid nonce");
  }

  if (tx.type === "registerParticipant") {
    if (state.participants[tx.from]) {
      throw new Error("Participant already registered");
    }
    const account = ensureAccount(state, tx.from);
    account.nonce += 1;
    state.stateRevision = (state.stateRevision ?? 0) + 1;
    state.participants[tx.from] = {
      address: tx.from,
      registeredAtHeight: inclusionBlockHeight(state)
    };
    return;
  }

  if (tx.type === "participantReferral") {
    const parentRaw = tx.payload?.parent;
    if (typeof parentRaw !== "string" || !isCanonicalAddress(parentRaw)) {
      throw new Error("Malformed participant address");
    }
    const child = tx.from;
    const parent = parentRaw;
    if (!state.participants[child]) {
      throw new Error("Child is not a participant");
    }
    if (!state.participants[parent]) {
      throw new Error("Parent is not a participant");
    }
    if (state.participants[child]!.parent) {
      throw new Error("Participant already has a parent");
    }
    if (child === parent) {
      throw new Error("Self-referral is not allowed");
    }
    participantEdgeDepth(state.participants, child, parent);
    const linkedAtHeight = inclusionBlockHeight(state);
    const account = ensureAccount(state, tx.from);
    account.nonce += 1;
    state.stateRevision = (state.stateRevision ?? 0) + 1;
    const current = state.participants[child]!;
    const nextParticipant: ParticipantState = {
      address: current.address,
      parent,
      linkedAtHeight
    };
    if (current.registeredAtHeight !== undefined) {
      nextParticipant.registeredAtHeight = current.registeredAtHeight;
    }
    // M13-2: linking a parent must not drop an existing identity proof.
    if (current.identityVerified !== undefined) {
      nextParticipant.identityVerified = current.identityVerified;
    }
    state.participants[child] = nextParticipant;
    return;
  }

  throw new Error("Unsupported participant transaction");
}

function feeSplitIsLegacy(config: NetworkConfig): boolean {
  const split = config.feeSplit;
  if (!split) {
    return true;
  }
  return (
    split.validatorShare === LEGACY_FEE_SPLIT.validatorShare &&
    split.communityShare === LEGACY_FEE_SPLIT.communityShare &&
    split.treasuryShare === LEGACY_FEE_SPLIT.treasuryShare &&
    split.liquidityShare === LEGACY_FEE_SPLIT.liquidityShare &&
    split.burnShare === LEGACY_FEE_SPLIT.burnShare
  );
}

/**
 * True when this fee is eligible for Model A, including fractional PPL.
 * Split arithmetic and Growth ledgers use integer micro-PPL. Zero fees and an
 * explicit non-legacy feeSplit stay outside this routing path.
 * Curve trading fees are not `tx.fee`; `routeTradingFee` classifies those.
 */
export function txFeeUsesLiveModelA(tx: Pick<Transaction, "type" | "fee">, config: NetworkConfig): boolean {
  if (!GROWTH_FEE_SPLIT_ACTIVE || !feeSplitIsLegacy(config)) {
    return false;
  }
  if (!Number.isFinite(tx.fee) || tx.fee <= 0) {
    return false;
  }
  return listEligibleFeeComponents({ txType: tx.type, txFee: pplToAtoms(tx.fee) }).length > 0;
}

function ensureGrowthPool(state: ChainState): GrowthPoolState {
  state.growthPool ??= createGrowthPoolState();
  return state.growthPool;
}

function addGrowthInflow(state: ChainState, inflow: number): void {
  if (inflow === 0) {
    return;
  }
  const pool = ensureGrowthPool(state);
  const epoch = growthEpochOfHeight(inclusionBlockHeight(state));
  state.growthEpochInflow ??= {};
  const epochNext = epoch >= 1 ? (state.growthEpochInflow[epoch] ?? 0) + inflow : 0;
  const next = pool.totalInflow + inflow;
  if (!Number.isSafeInteger(next) || !Number.isSafeInteger(epochNext)) {
    throw new Error("Growth Pool inflow exceeds safe integer");
  }
  pool.totalInflow = next;
  if (epoch >= 1) {
    state.growthEpochInflow[epoch] = epochNext;
  }
  assertGrowthPoolConservation(pool);
}

const MAX_GROWTH_SETTLEMENT_FAILURES = 20;

/** Last block of a Growth Epoch settles that epoch before the state root. */
function closeGrowthEpochIfBoundary(state: ChainState, config: NetworkConfig): void {
  const height = inclusionBlockHeight(state);
  if (height % GROWTH_EPOCH_LENGTH !== 0) {
    return;
  }
  const epoch = height / GROWTH_EPOCH_LENGTH;
  if (!consensusUpgrade1Active(config, height)) {
    settleGrowthEpoch(state, epoch);
    return;
  }
  try {
    settleGrowthEpoch(state, epoch);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.growthSettlementFailures ??= [];
    state.growthSettlementFailures.push({ epoch, height, message });
    if (state.growthSettlementFailures.length > MAX_GROWTH_SETTLEMENT_FAILURES) {
      state.growthSettlementFailures.splice(0, state.growthSettlementFailures.length - MAX_GROWTH_SETTLEMENT_FAILURES);
    }
  }
}

/**
 * Credits the validator share of an already-debited fee.
 * Equal integer shares among active validators; the division remainder goes to
 * the first. If none are active, the share (including Model A dust) is credited
 * to treasury, the same fallback `routeTradingFee` already used. No mint.
 */
function payValidatorFeeShare(state: ChainState, amount: number): void {
  if (amount <= 0) {
    return;
  }
  const active = Object.values(state.validators).filter((validator) => validator.status === "active");
  if (active.length === 0) {
    state.treasury ??= {};
    state.treasury[NATIVE_ASSET_ID] = (state.treasury[NATIVE_ASSET_ID] ?? 0) + amount / PPL_SCALE;
    return;
  }
  const share = Math.floor(amount / active.length);
  const remainder = amount - share * active.length;
  for (let index = 0; index < active.length; index += 1) {
    const credit = share + (index === 0 ? remainder : 0);
    if (credit === 0) {
      continue;
    }
    const account = ensureAccount(state, active[index]!.address);
    account.balance += credit / PPL_SCALE;
    account.balances[NATIVE_ASSET_ID] = account.balance;
  }
}

/** Partitions one already-debited eligible amount. Remainder stays in the validator share. */
function applyModelAFee(state: ChainState, amount: number): ApprovedFeeSplitResult {
  const split = calculateApprovedFeeSplit(amount, growthFeeSplitSwitch());
  if (!split.active) {
    throw new Error("Live fee split is not active");
  }
  if (split.communityAmount > 0) {
    allocateToCommunityPool(state.communityPool, NATIVE_ASSET_ID, split.communityAmount / PPL_SCALE);
  }
  if (split.treasuryAmount > 0) {
    state.treasury ??= {};
    state.treasury[NATIVE_ASSET_ID] = (state.treasury[NATIVE_ASSET_ID] ?? 0) + split.treasuryAmount / PPL_SCALE;
  }
  if (split.burnAmount > 0) {
    state.burned ??= {};
    state.burned[NATIVE_ASSET_ID] = (state.burned[NATIVE_ASSET_ID] ?? 0) + split.burnAmount / PPL_SCALE;
  }
  if (split.liquidityAmount > 0) {
    const next = state.feeLiquidityEcosystem + split.liquidityAmount;
    if (!Number.isSafeInteger(next)) {
      throw new Error("Liquidity ecosystem fee exceeds safe integer");
    }
    state.feeLiquidityEcosystem = next;
  }
  addGrowthInflow(state, split.growthAmount);
  payValidatorFeeShare(state, split.validatorAmount);
  return split;
}

function routeEligibleTxFee(state: ChainState, tx: Transaction, config: NetworkConfig): void {
  if (!txFeeUsesLiveModelA(tx, config)) {
    return;
  }
  for (const component of listEligibleFeeComponents({ txType: tx.type, txFee: pplToAtoms(tx.fee) })) {
    applyModelAFee(state, component.amount);
  }
}

function noteGrowthEpoch(state: ChainState, address: string, kind: "C" | "N"): void {
  if (!state.participants[address]) {
    return;
  }
  const epoch = growthEpochOfHeight(inclusionBlockHeight(state));
  if (epoch < 1) {
    return;
  }
  if (kind === "C") {
    markQualifyingContribution(state, address, epoch);
  } else {
    markNetworkActivity(state, address, epoch);
  }
}

function noteQualifyingTransfer(state: ChainState, from: string, fee: number, counterparties: readonly string[]): void {
  if (!(fee > 0) || !state.participants[from]) {
    return;
  }
  const parent = state.participants[from]?.parent;
  const qualifies = counterparties.some((counterparty) => counterparty !== from && counterparty !== parent);
  if (!qualifies) {
    return;
  }
  noteGrowthEpoch(state, from, "C");
}

function applyGrowthClaim(state: ChainState, tx: Transaction): void {
  if (tx.fee !== 0) {
    throw new Error("Growth claim must not charge a fee");
  }
  if (!isCanonicalAddress(tx.from)) {
    throw new Error("Malformed participant address");
  }
  const epoch = tx.payload?.epoch;
  const referred = tx.payload?.referred;
  const level = tx.payload?.level;
  if (typeof epoch !== "number" || !Number.isSafeInteger(epoch) || epoch < 1) {
    throw new Error("Invalid growth epoch");
  }
  if (typeof referred !== "string" || !isCanonicalAddress(referred)) {
    throw new Error("Malformed participant address");
  }
  if (level !== 1 && level !== 2) {
    throw new Error("Invalid growth claim level");
  }
  if (!Number.isFinite(tx.amount) || tx.amount <= 0) {
    throw new Error("Growth claim must be the full amount");
  }
  const key = growthClaimKey(epoch, tx.from, referred, level);
  const claim = state.growthClaims?.[key];
  if (!claim || claim.referrer !== tx.from) {
    const foreign = Object.values(state.growthClaims ?? {}).some(
      (row) => row.epoch === epoch && row.referred === referred && row.level === level && row.referrer !== tx.from
    );
    throw new Error(foreign ? "Growth claim referrer mismatch" : "Growth claim not found");
  }
  if (claim.status !== "claimable") {
    throw new Error("Growth claim is not claimable");
  }
  if (pplToAtoms(tx.amount) !== claim.amount) {
    throw new Error("Partial growth claim");
  }
  const account = ensureAccount(state, tx.from);
  if (tx.nonce !== account.nonce) {
    throw new Error("Invalid nonce");
  }
  const nextEscrow = state.growthPool.escrow - claim.amount;
  const nextSettled = state.growthPool.claimedSettled + claim.amount;
  const nextBalance = account.balance + claim.amount / PPL_SCALE;
  if (
    nextEscrow < 0 ||
    !Number.isSafeInteger(nextEscrow) ||
    !Number.isSafeInteger(nextSettled) ||
    !Number.isSafeInteger(Math.round(nextBalance * PPL_SCALE))
  ) {
    throw new Error("Growth claim failed conservation");
  }
  account.nonce += 1;
  account.balance = nextBalance;
  account.balances[NATIVE_ASSET_ID] = nextBalance;
  state.growthPool.escrow = nextEscrow;
  state.growthPool.claimedSettled = nextSettled;
  state.growthClaims[key] = { ...claim, status: "settled" };
  assertGrowthPoolConservation(state.growthPool);
  state.stateRevision = (state.stateRevision ?? 0) + 1;
}

const LOWER_HEX = /^[0-9a-f]+$/;

/**
 * M01-1/M03-5: `from`, `publicKey` and `signature` are hex strings that verify regardless of
 * case (`isCanonicalAddressMatch` and `hexToBytes` both tolerate mixed case), but `state.accounts`
 * and `state.validators` are keyed by the literal string, so two transactions whose `from` differs
 * only by case would silently create two accounts for the same key. Behind the upgrade, only the
 * lowercase form is accepted.
 */
function isCanonicalCaseTransaction(tx: Transaction): boolean {
  if (!isCanonicalAddress(tx.from)) return false;
  if (tx.publicKey !== undefined && !LOWER_HEX.test(tx.publicKey)) return false;
  if (tx.signature !== undefined && !LOWER_HEX.test(tx.signature)) return false;
  return true;
}

/** Validate untrusted numeric fields for EVERY transaction family before touching state. */
export function validateTransactionValues(tx: Transaction): void {
  if (!tx || typeof tx !== "object" || typeof tx.id !== "string" || !tx.id || tx.id.length > 256 ||
      typeof tx.from !== "string" || !tx.from || typeof tx.to !== "string" || !tx.to ||
      !Number.isFinite(tx.amount) || tx.amount < 0 || tx.amount > Number.MAX_SAFE_INTEGER ||
      !Number.isFinite(tx.fee) || tx.fee < 0 || tx.fee > Number.MAX_SAFE_INTEGER ||
      !Number.isSafeInteger(tx.nonce) || tx.nonce < 0 || !Number.isSafeInteger(tx.timestamp) || tx.timestamp < 0) {
    throw new Error("Invalid transaction values");
  }
  pplToAtoms(tx.fee);
  if (tx.type === "transfer" && tx.payload?.recipients === undefined && !isCanonicalAddress(tx.to)) throw new Error("Invalid recipient address");
  if (tx.type === "nftTransfer" && !isCanonicalAddress(tx.to)) throw new Error("Invalid NFT transfer recipient");
  const types = ["transfer", "joinValidator", "leaveValidator", "unstake", "attestation", "slashEvidence", "proposal", "vote", "tokenCreate", "curveBuy", "curveSell", "creatorClaim", "nftMint", "nftTransfer", "contractDeploy", "contractCall", "registerParticipant", "participantReferral", "growthClaim", "ammCreatePool", "ammAddLiquidity", "ammRemoveLiquidity", "ammSwap", "promoAward", "promoClaim", "promoReturn"];
  if (!types.includes(tx.type)) throw new Error("Unsupported transaction type");
}

/** Commit only successful transitions, including configuration and asynchronous EVM state. */
export function applyTransaction(state: ChainState, tx: Transaction, config: NetworkConfig): void | Promise<void> {
  validateTransactionValues(tx);
  if (securityUpgradeActive(config, inclusionBlockHeight(state))) {
    if (tx.id !== contentTransactionId(tx)) throw new Error("Transaction ID must match signed content");
    if (Object.hasOwn(state.proposals, tx.id) || Object.hasOwn(state.contractReceipts ?? {}, tx.id)) throw new Error("Transaction ID already exists");
  }
  if (consensusUpgrade1Active(config, inclusionBlockHeight(state)) && !isCanonicalCaseTransaction(tx)) {
    throw new Error("Address, public key and signature must be lowercase hex");
  }
  const draft = structuredClone(state);
  const nextConfig = structuredClone(config);
  const commit = () => { Object.assign(state, draft); Object.assign(config, nextConfig); };
  const result = applyTransactionUnchecked(draft, tx, nextConfig);
  if (result instanceof Promise) return result.then(commit);
  commit();
}

function applyTransactionUnchecked(state: ChainState, tx: Transaction, config: NetworkConfig): void | Promise<void> {
  if (tx.type === "registerParticipant" || tx.type === "participantReferral") {
    applyParticipantTransaction(state, tx);
    return;
  }
  if (tx.type === "growthClaim") {
    applyGrowthClaim(state, tx);
    return;
  }
  const from = ensureAccount(state, tx.from);

  if (tx.nonce !== from.nonce) {
    throw new Error("Invalid nonce");
  }
  state.stateRevision = (state.stateRevision ?? 0) + 1;

  if (tx.type === "joinValidator") {
    if (securityUpgradeActive(config, inclusionBlockHeight(state)) && !config.securityUpgrade!.validatorAllowlist.includes(tx.from)) {
      throw new Error("Validator is not on the approved allowlist");
    }
    if (tx.amount < config.minStake) {
      throw new Error("Stake below minimum");
    }
    // B10 (behind the upgrade): native PPL is atom-exact everywhere else (M04-4's transfer
    // bound), but a stake was never run through `pplToAtoms`, so e.g. `100.0000005` was accepted
    // and stored in `validator.stake` — unrepresentable in atoms and skewing quorum/vote weights.
    if (consensusUpgrade1Active(config, inclusionBlockHeight(state))) {
      pplToAtoms(tx.amount);
    }
    if (from.balance < tx.amount + tx.fee) {
      throw new Error("Insufficient balance for stake");
    }
    // M04-3 (behind the security upgrade): joining used to overwrite the caller's record, so an
    // existing validator could reset their own stake, referral and scores — or a jailed one could
    // clear `jailUntilEpoch` — by sending joinValidator again. Only a retired record (already
    // unstaked) may be replaced; that keeps the exit-then-rejoin path working.
    const existingValidator = state.validators[tx.from];
    if (
      existingValidator &&
      securityUpgradeActive(config, inclusionBlockHeight(state)) &&
      !(existingValidator.status === "inactive" && existingValidator.stake === 0)
    ) {
      throw new Error("Validator already joined");
    }
    const referrerRaw = tx.payload?.referrer;
    let referredBy: string | undefined;
    if (referrerRaw !== undefined && referrerRaw !== null && String(referrerRaw).trim() !== "") {
      const referrer = String(referrerRaw).trim();
      if (referrer === tx.from) {
        throw new Error("Self-referral is not allowed");
      }
      const referrerValidator = state.validators[referrer];
      if (!referrerValidator || (referrerValidator.status !== "active" && referrerValidator.status !== "joining")) {
        throw new Error("Referrer must be an active or joining validator");
      }
      referredBy = referrer;
    }
    from.balance -= tx.amount + tx.fee;
    from.balances[NATIVE_ASSET_ID] = from.balance;
    from.nonce += 1;
    state.validators[tx.from] = {
      address: tx.from,
      nodeKind: (tx.payload?.nodeKind as "full" | "light") ?? "full",
      status: "joining",
      stake: tx.amount,
      uptimeScore: 1,
      attestationScore: 1,
      lastSeen: tx.timestamp,
      joinedAtEpoch: state.epoch,
      proposedMisses: 0,
      ...(referredBy ? { referredBy } : {})
    };
    routeEligibleTxFee(state, tx, config);
    return;
  }

  if (tx.type === "leaveValidator") {
    const validator = state.validators[tx.from];
    // M10-4: `activateValidators` only un-jails a slashed validator once its remaining stake is
    // back above `minStake`, so a slashed-and-poor validator used to be stuck forever — neither
    // active nor able to leave. Behind the upgrade, a validator whose jail has ended may leave
    // (and later unstake what remains) even if that remainder is below `minStake`.
    const jailOver =
      validator?.status === "slashed" && validator.jailUntilEpoch !== undefined && state.epoch >= validator.jailUntilEpoch;
    const canLeaveAfterSlash = consensusUpgrade1Active(config, inclusionBlockHeight(state)) && jailOver;
    if (!validator || (validator.status !== "active" && validator.status !== "joining" && !canLeaveAfterSlash)) {
      throw new Error("Not an active validator");
    }
    from.nonce += 1;
    validator.status = "unbonding";
    validator.unbondingEpoch = state.epoch + config.unbondingEpochs;
    if (canLeaveAfterSlash) validator.jailUntilEpoch = undefined;
    return;
  }

  if (tx.type === "unstake") {
    const validator = state.validators[tx.from];
    if (!validator || validator.status !== "unbonding") {
      throw new Error("Validator not unbonding");
    }
    if ((validator.unbondingEpoch ?? Number.MAX_SAFE_INTEGER) > state.epoch) {
      throw new Error("Unbonding period not finished");
    }
    from.balance += validator.stake;
    from.balances[NATIVE_ASSET_ID] = from.balance;
    from.nonce += 1;
    validator.stake = 0;
    validator.status = "inactive";
    return;
  }

  if (tx.type === "attestation") {
    const validator = state.validators[tx.from];
    if (!validator) {
      throw new Error("Unknown validator");
    }
    if (validator.status !== "active" && validator.status !== "joining") {
      throw new Error("Validator not eligible to attest");
    }
    if (validator.jailUntilEpoch && validator.jailUntilEpoch > state.epoch) {
      throw new Error("Validator jailed");
    }
    const height = Number(tx.payload?.headerHeight ?? 0);
    const blockHash = String(tx.payload?.blockHash ?? "");
    if (height <= 0 || !blockHash) {
      throw new Error("Attestation requires headerHeight and blockHash");
    }
    const block = state.chain.find((item) => item.header.height === height && item.hash === blockHash);
    if (!block) {
      throw new Error("Attestation block not found");
    }

    const ballotKey = `${height}:${tx.from}:${blockHash}`;
    state.attestationBallots[ballotKey] = true;

    const existing = state.attestationVotes[height]?.[tx.from];
    if (existing && existing.blockHash !== blockHash) {
      state.attestationBallots[`${height}:${tx.from}:${existing.blockHash}`] = true;
      from.nonce += 1;
      validator.lastSeen = tx.timestamp;
      applySlash(state, config, tx.from, SLASH_FRACTION, state.epoch + SLASH_JAIL_EPOCHS);
      return;
    }

    validator.attestationScore = Math.min(1, validator.attestationScore + 0.02);
    validator.uptimeScore = Math.min(1, validator.uptimeScore + 0.01);
    validator.lastSeen = tx.timestamp;
    from.nonce += 1;

    if (!state.attestationVotes[height]) {
      state.attestationVotes[height] = {};
    }
    const weight = validator.stake * (validator.nodeKind === "light" ? config.lightValidatorWeightMultiplier : 1);
    state.attestationVotes[height]![tx.from] = { weight, blockHash };
    updateFinality(state, config);
    return;
  }

  if (tx.type === "slashEvidence") {
    const evidence = tx.payload as unknown as SlashEvidence;
    if (!verifySlashEvidence(state, evidence)) {
      throw new Error("Invalid slash evidence");
    }
    const evidenceKey = hashJson([evidence.type, evidence.validator, evidence.height, [evidence.blockHashA, evidence.blockHashB].sort()]);
    state.appliedSlashEvidence ??= {};
    if (state.appliedSlashEvidence[evidenceKey]) throw new Error("Slash evidence already applied");
    state.appliedSlashEvidence[evidenceKey] = true;
    from.nonce += 1;
    applySlash(
      state,
      config,
      evidence.validator,
      SLASH_FRACTION,
      state.epoch + SLASH_JAIL_EPOCHS,
      evidence.reporter ?? tx.from
    );
    return;
  }

  if (tx.type === "proposal") {
    if (from.balance < tx.fee) {
      throw new Error("Insufficient balance");
    }
    from.balance -= tx.fee;
    from.balances[NATIVE_ASSET_ID] = from.balance;
    from.nonce += 1;
    if (securityUpgradeActive(config, inclusionBlockHeight(state)) && Object.hasOwn(state.proposals, tx.id)) throw new Error("Proposal ID already exists");
    const params = (tx.payload?.params ?? {}) as GovernanceProposal["params"];
    if (securityUpgradeActive(config, inclusionBlockHeight(state)) && params.epochBaseIssuance !== undefined) throw new Error("Protocol issuance is disabled");
    state.proposals[tx.id] = {
      id: tx.id,
      proposer: tx.from,
      createdEpoch: state.epoch,
      status: "open",
      params,
      votesFor: 0,
      votesAgainst: 0,
      voters: []
    };
    routeEligibleTxFee(state, tx, config);
    return;
  }

  if (tx.type === "vote") {
    const proposalId = String(tx.payload?.proposalId ?? "");
    const support = Boolean(tx.payload?.support);
    const proposal = ownGet(state.proposals, proposalId);
    const validator = state.validators[tx.from];
    if (!proposal || proposal.status !== "open") {
      throw new Error("Unknown proposal");
    }
    if (!validator || validator.status !== "active") {
      throw new Error("Only active validators can vote");
    }
    if (proposal.voters.includes(tx.from)) {
      throw new Error("Already voted");
    }
    from.nonce += 1;
    proposal.voters.push(tx.from);
    if (support) {
      proposal.votesFor += validator.stake;
    } else {
      proposal.votesAgainst += validator.stake;
    }
    const total = proposal.votesFor + proposal.votesAgainst;
    const activeStake = Object.values(state.validators)
      .filter((item) => item.status === "active")
      .reduce((sum, item) => sum + item.stake, 0);
    if (total >= activeStake * 0.5) {
      if (proposal.votesFor > proposal.votesAgainst) {
        proposal.status = "passed";
        applyProposalParams(config, proposal.params, securityUpgradeActive(config, inclusionBlockHeight(state)));
      } else {
        proposal.status = "rejected";
      }
    }
    return;
  }

  if (tx.type === "tokenCreate") {
    applyTokenCreate(state, tx, config);
    return;
  }

  if (tx.type === "curveBuy") {
    applyCurveBuy(state, tx, config);
    return;
  }

  if (tx.type === "curveSell") {
    applyCurveSell(state, tx, config);
    return;
  }

  if (tx.type === "creatorClaim") {
    applyCreatorClaim(state, tx, config);
    return;
  }

  if (tx.type === "promoAward" || tx.type === "promoClaim" || tx.type === "promoReturn") {
    applyPromoTransaction(state, tx, config);
    return;
  }

  if (tx.type === "nftMint") {
    applyNftMint(state, tx, config);
    return;
  }

  if (tx.type === "nftTransfer") {
    applyNftTransfer(state, tx, config);
    return;
  }

  if (tx.type === "contractDeploy" || tx.type === "contractCall") {
    return (async () => {
      await applyContractTransaction(state, tx);
      // M12-3: `tx.fee` for a contract call is a PPL amount derived from gas, almost never a
      // whole-PPL safe integer, so this gate used to skip `routeEligibleTxFee` for nearly every
      // contract fee — and `txFeeUsesLiveModelA` (used by the caller to decide the legacy
      // `pendingValidatorFees` bucket) already treats the same fee as Model A-eligible via a
      // `Number.isFinite` check, so the fee was credited nowhere at all. Behind the upgrade, use
      // that same finite-and-positive gate here too; `routeEligibleTxFee` itself bounds the fee
      // to atoms via `pplToAtoms`.
      const feeEligible = consensusUpgrade1Active(config, inclusionBlockHeight(state))
        ? Number.isFinite(tx.fee)
        : Number.isSafeInteger(tx.fee);
      if (feeEligible && tx.fee > 0) {
        routeEligibleTxFee(state, tx, config);
      }
    })();
  }

  if (
    tx.type === "ammCreatePool" ||
    tx.type === "ammAddLiquidity" ||
    tx.type === "ammRemoveLiquidity" ||
    tx.type === "ammSwap"
  ) {
    applyAmmTransaction(state, tx, config);
    if (Number.isFinite(tx.fee) && tx.fee > 0) {
      routeEligibleTxFee(state, tx, config);
    }
    return;
  }

  const rawAssetId = tx.assetId ?? (tx.payload?.assetId as string | undefined) ?? NATIVE_ASSET_ID;
  if (!isValidAssetId(rawAssetId)) {
    throw new Error(`Invalid asset ID: ${rawAssetId}`);
  }
  const assetId = canonicalizeAssetId(rawAssetId);
  const asset = ownGet(state.assets, assetId);
  if (!asset) {
    throw new Error(`Asset not found: ${assetId}`);
  }

  if (!Number.isFinite(tx.amount) || tx.amount <= 0 || tx.amount > Number.MAX_SAFE_INTEGER) {
    throw new Error("Invalid transfer amount");
  }
  if (assetId !== NATIVE_ASSET_ID && !Number.isSafeInteger(tx.amount)) {
    throw new Error("Token amount must be an integer base unit");
  }
  // M04-4 (behind the security upgrade): native PPL moves in micro-PPL everywhere else, so a
  // transfer may not carry a value the atom accounting cannot represent.
  if (assetId === NATIVE_ASSET_ID && securityUpgradeActive(config, inclusionBlockHeight(state))) {
    pplToAtoms(tx.amount);
  }
  if (!Number.isFinite(tx.fee) || tx.fee < 0 || tx.fee > Number.MAX_SAFE_INTEGER) {
    throw new Error("Invalid transaction fee");
  }

  const batchRecipients = validateBatchTransfer(
    tx,
    securityUpgradeActive(config, inclusionBlockHeight(state))
  );

  if (assetId === NATIVE_ASSET_ID) {
    if (from.balance < tx.amount + tx.fee) {
      throw new Error("Insufficient balance");
    }
    from.balance = requireBalance(from.balance - (tx.amount + tx.fee), NATIVE_ASSET_ID);
    from.balances[NATIVE_ASSET_ID] = from.balance;
    from.nonce += 1;

    if (batchRecipients) {
      for (const item of batchRecipients) {
        const recipient = ensureAccount(state, item.to);
        recipient.balance = requireBalance(recipient.balance + item.amount, NATIVE_ASSET_ID);
        recipient.balances[NATIVE_ASSET_ID] = recipient.balance;
      }
      routeEligibleTxFee(state, tx, config);
      noteQualifyingTransfer(
        state,
        tx.from,
        tx.fee,
        batchRecipients.map((item) => item.to)
      );
      return;
    }

    const to = ensureAccount(state, tx.to);
    to.balance = requireBalance(to.balance + tx.amount, NATIVE_ASSET_ID);
    to.balances[NATIVE_ASSET_ID] = to.balance;
    routeEligibleTxFee(state, tx, config);
    noteQualifyingTransfer(state, tx.from, tx.fee, [tx.to]);
    return;
  }

  // Non-native asset transfer: fee is paid in native asset, amount in target asset
  if (from.balance < tx.fee) {
    throw new Error("Insufficient native balance for fee");
  }
  const fromTokenBal = ownGet(from.balances, assetId) ?? 0;
  if (fromTokenBal < tx.amount) {
    throw new Error(`Insufficient balance for asset: ${assetId}`);
  }

  from.balance = requireBalance(from.balance - tx.fee, NATIVE_ASSET_ID);
  from.balances[NATIVE_ASSET_ID] = from.balance;
  from.balances[assetId] = requireBalance(fromTokenBal - tx.amount, assetId);
  from.nonce += 1;

  if (batchRecipients) {
    for (const item of batchRecipients) {
      const recipient = ensureAccount(state, item.to);
      recipient.balances[assetId] = requireBalance((ownGet(recipient.balances, assetId) ?? 0) + item.amount, assetId);
    }
    routeEligibleTxFee(state, tx, config);
    noteQualifyingTransfer(
      state,
      tx.from,
      tx.fee,
      batchRecipients.map((item) => item.to)
    );
    return;
  }

  const to = ensureAccount(state, tx.to);
  to.balances[assetId] = requireBalance((ownGet(to.balances, assetId) ?? 0) + tx.amount, assetId);
  routeEligibleTxFee(state, tx, config);
  noteQualifyingTransfer(state, tx.from, tx.fee, [tx.to]);
}

export function calculateVestedAmount(
  vesting: CreatorVestingState,
  currentBlock: number
): number {
  if (currentBlock <= vesting.startBlock) {
    return vesting.upfrontUnlocked;
  }
  const elapsed = currentBlock - vesting.startBlock;
  if (elapsed >= vesting.durationBlocks) {
    return vesting.totalAllocation;
  }
  const remainingToVestBig = BigInt(vesting.totalAllocation - vesting.upfrontUnlocked);
  const elapsedBig = BigInt(elapsed);
  const durationBig = BigInt(vesting.durationBlocks);
  const linearVestedBig = (remainingToVestBig * elapsedBig) / durationBig;
  const totalVestedBig = BigInt(vesting.upfrontUnlocked) + linearVestedBig;
  return BondingCurveEngine.toSafeInteger(totalVestedBig, "vestedAmount");
}

export function getClaimableVestedTokens(
  vesting: CreatorVestingState,
  currentBlock: number
): number {
  const totalVested = calculateVestedAmount(vesting, currentBlock);
  return Math.max(0, totalVested - vesting.claimedAmount);
}

export function routeTradingFee(
  state: ChainState,
  fee: number,
  config: NetworkConfig
): FeeSplitResult {
  if (fee <= 0) {
    return {
      validatorAmount: 0,
      communityAmount: 0,
      treasuryAmount: 0,
      liquidityAmount: 0,
      burnAmount: 0,
      growthAmount: 0,
      total: 0
    };
  }
  if (GROWTH_FEE_SPLIT_ACTIVE && feeSplitIsLegacy(config) && Number.isFinite(fee)) {
    const split = applyModelAFee(state, pplToAtoms(fee));
    return {
      validatorAmount: split.validatorAmount / PPL_SCALE,
      communityAmount: split.communityAmount / PPL_SCALE,
      treasuryAmount: split.treasuryAmount / PPL_SCALE,
      liquidityAmount: split.liquidityAmount / PPL_SCALE,
      burnAmount: split.burnAmount / PPL_SCALE,
      growthAmount: split.growthAmount / PPL_SCALE,
      total: split.total / PPL_SCALE
    };
  }
  const split = FeeSplitter.split(fee, config.feeSplit ?? LEGACY_FEE_SPLIT);
  if (split.communityAmount > 0) {
    allocateToCommunityPool(state.communityPool, NATIVE_ASSET_ID, split.communityAmount);
  }
  if (split.treasuryAmount > 0) {
    state.treasury ??= {};
    state.treasury[NATIVE_ASSET_ID] = (state.treasury[NATIVE_ASSET_ID] ?? 0) + split.treasuryAmount;
  }
  if (split.burnAmount > 0) {
    state.burned ??= {};
    state.burned[NATIVE_ASSET_ID] = (state.burned[NATIVE_ASSET_ID] ?? 0) + split.burnAmount;
  }
  if (split.validatorAmount > 0) {
    const active = Object.values(state.validators).filter((v) => v.status === "active");
    if (active.length > 0) {
      const share = Math.floor(split.validatorAmount / active.length);
      const rem = split.validatorAmount - share * active.length;
      for (let i = 0; i < active.length; i++) {
        const val = active[i]!;
        const amt = share + (i === 0 ? rem : 0);
        ensureAccount(state, val.address).balance += amt;
        state.accounts[val.address]!.balances[NATIVE_ASSET_ID] = state.accounts[val.address]!.balance;
      }
    } else {
      state.treasury ??= {};
      state.treasury[NATIVE_ASSET_ID] = (state.treasury[NATIVE_ASSET_ID] ?? 0) + split.validatorAmount;
    }
  }
  return split;
}

export function executeMigration(
  state: ChainState,
  assetId: string,
  currentHeight: number = 0
): void {
  const curve = ownGet(state.curves, assetId);
  if (!curve || curve.status === "migrated") {
    return;
  }
  const availableLiq = state.liquidityReserves[assetId] ?? 0;
  const migration = BondingCurveEngine.calculateMigration(curve, availableLiq);

  state.liquidityReserves[assetId] = migration.remainingLiquidityReserve;
  state.launchReserves[assetId] =
    (state.launchReserves[assetId] ?? 0) + migration.remainingCurveInventoryToLaunchReserve;
  curve.currentTokenReserve = 0;
  curve.status = "migrated";
  curve.migratedAt = currentHeight;

  // AMM v0.1 hook: curve completion writes a locked TOKEN/PPL pool. Object shape
  // must stay identical to historical migrations (no LP fields) so replayed
  // stateRoots match. Swaps use reserves only; LP shares bootstrap on first add/remove.
  const poolId = nativeLiquidityPoolId(assetId);
  curve.liquidityPoolId = poolId;
  const existing = ownGet(state.liquidityPools, poolId);
  if (existing) {
    // A manual TOKEN/PPL pool already exists: never overwrite its reserves or
    // LP shares. Merge migrated liquidity as locked, protocol-owned shares.
    mergeMigratedLiquidity(existing, migration.poolTokenReserve, migration.poolNativeReserve, curve.nativeScale);
    return;
  }
  state.liquidityPools[poolId] = {
    poolId,
    tokenAssetId: assetId,
    nativeAssetId: NATIVE_ASSET_ID,
    tokenReserve: migration.poolTokenReserve,
    ...(curve.nativeScale ? { nativeScale: curve.nativeScale } : {}),
    nativeReserve: migration.poolNativeReserve,
    feeBps: AMM_FEE_BPS,
    status: "active",
    locked: true,
    createdAt: currentHeight
  };
}

export function applyTokenCreate(
  state: ChainState,
  tx: Transaction,
  config: NetworkConfig
): void {
  const from = ensureAccount(state, tx.from);
  if (from.nonce !== tx.nonce) {
    throw new Error("Invalid nonce");
  }
  const launchFee = tokenCreateMinFee();
  if (tx.fee < launchFee) {
    throw new Error(`Token creation requires at least ${launchFee} NATIVE launch fee`);
  }
  if (from.balance < tx.fee) {
    throw new Error("Insufficient native balance for launch fee");
  }

  const name = String(tx.payload?.name ?? "").trim();
  const symbol = String(tx.payload?.symbol ?? "").trim().toUpperCase();
  const decimals = Number(tx.payload?.decimals ?? 6);
  const totalSupply = Number(tx.payload?.totalSupply ?? 0);
  const metadata = (tx.payload?.metadata as Record<string, unknown> | undefined) ?? {};

  if (!name || name.length < 2 || name.length > 64) {
    throw new Error("Invalid token name (must be 2-64 characters)");
  }
  if (!symbol || !/^[A-Z0-9_-]{2,16}$/i.test(symbol)) {
    throw new Error("Invalid token symbol (must be 2-16 alphanumeric characters)");
  }
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error("Invalid decimals (must be integer 0-18)");
  }
  if (!Number.isSafeInteger(totalSupply) || totalSupply <= 0) {
    throw new Error("Total supply must be a positive safe integer");
  }
  const minSupplyBase = Number(1_000_000n * 10n ** BigInt(decimals));
  if (!Number.isSafeInteger(minSupplyBase) || totalSupply < minSupplyBase) {
    throw new Error("Total supply must be at least 1,000,000 whole tokens");
  }

  const requestedAssetId = tx.payload?.assetId ? canonicalizeAssetId(String(tx.payload.assetId)) : undefined;
  const assetId = requestedAssetId && isValidAssetId(requestedAssetId) ? requestedAssetId : symbol.toLowerCase();
  if (!isValidAssetId(assetId)) {
    throw new Error(`Derived asset ID is invalid: ${assetId}`);
  }
  if (assetId === NATIVE_ASSET_ID || assetId === LEGACY_NATIVE_ASSET_ID) {
    throw new Error(`Asset ID already exists: ${NATIVE_ASSET_ID}`);
  }
  if (ownGet(state.assets, assetId)) {
    throw new Error(`Asset ID already exists: ${assetId}`);
  }

  // Optional creator promo share (owner decision 2026-10-13, docs/TOKEN-ECONOMY.md §4a).
  // Below the coordinated activation height `parsePromoBps` returns 0 and ignores the payload
  // field, so every line after this point is the pre-upgrade code path, byte for byte.
  const promoBps = parsePromoBps(tx.payload, promoShareActive(config, inclusionBlockHeight(state)));
  const { allocation, promo } = applyPromoToAllocation(
    BondingCurveEngine.calculateTokenAllocation(totalSupply),
    totalSupply,
    promoBps
  );
  const currentHeight = state.chain.length > 0 ? state.chain[state.chain.length - 1]!.header.height : 0;

  from.balance -= tx.fee;
  from.balances[NATIVE_ASSET_ID] = from.balance;
  from.nonce += 1;

  state.assets[assetId] = {
    assetId,
    type: "user",
    name,
    symbol,
    decimals,
    totalSupply,
    creator: tx.from,
    creationMetadata: metadata,
    status: "active",
    createdAt: currentHeight,
    allocation
  };

  // 10% Community Pool
  allocateToCommunityPool(state.communityPool, assetId, allocation.communityPool);

  // 15% Creator Allocation (10% upfront unlocked, 90% linear vesting across 180 days)
  const upfront = BondingCurveEngine.toSafeInteger(
    (BigInt(allocation.creator) * 10n) / 100n,
    "upfrontUnlocked"
  );
  setAccountBalance(from, assetId, upfront);

  state.vesting[assetId] = {
    assetId,
    creator: tx.from,
    totalAllocation: allocation.creator,
    upfrontUnlocked: upfront,
    vestedAmount: upfront,
    claimedAmount: upfront,
    startBlock: currentHeight,
    durationBlocks: 5_184_000 // 180 days at 3s/block
  };

  // 10% Liquidity Reserve & 5% Ecosystem Reserve & 0 Launch Reserve
  state.liquidityReserves[assetId] = allocation.liquidityReserve;
  state.ecosystemReserves[assetId] = allocation.ecosystemReserve;
  state.launchReserves[assetId] = 0;

  // 60% Bonding Curve (55% / 50% when the creator chose a promo share)
  state.curves[assetId] = BondingCurveEngine.createCurveStateForAllocation(
    assetId,
    totalSupply,
    allocation.bondingCurve,
    securityUpgradeActive(config, inclusionBlockHeight(state))
  );

  // 0 / 5% / 10% Promo Share — held under the PromoRewardsVault rules, not credited to anyone.
  if (promoBps !== PROMO_BPS_NONE && promo > 0) {
    state.promoPools ??= {};
    state.promoPools[assetId] = createPromoPool(assetId, tx.from, promoBps, promo, currentHeight);
  }
  routeEligibleTxFee(state, tx, config);
  if ((securityUpgradeActive(config, inclusionBlockHeight(state)) ? Number.isFinite(tx.fee) : Number.isSafeInteger(tx.fee)) && tx.fee > 0) {
    noteGrowthEpoch(state, tx.from, "N");
  }
}

export function applyNftMint(
  state: ChainState,
  tx: Transaction,
  config: NetworkConfig
): void {
  const from = ensureAccount(state, tx.from);
  if (from.nonce !== tx.nonce) {
    throw new Error("Invalid nonce");
  }
  const minFee = nftMintMinFee();
  if (!Number.isFinite(tx.fee) || tx.fee < minFee) {
    throw new Error(`NFT mint requires at least ${minFee} NATIVE fee`);
  }
  if (from.balance < tx.fee) {
    throw new Error("Insufficient native balance for mint fee");
  }
  const parsed = parseNftMintPayload(tx, consensusUpgrade1Active(config, inclusionBlockHeight(state)));
  const nftId = parsed.requestedId ?? deriveNftId(tx.from, tx.nonce, parsed.name);
  state.nfts ??= {};
  if (state.nfts[nftId]) {
    throw new Error(`NFT already exists: ${nftId}`);
  }
  const currentHeight = state.chain.length > 0 ? state.chain[state.chain.length - 1]!.header.height : 0;
  from.balance -= tx.fee;
  from.balances[NATIVE_ASSET_ID] = from.balance;
  from.nonce += 1;
  state.nfts[nftId] = {
    nftId,
    owner: tx.from,
    creator: tx.from,
    name: parsed.name,
    description: parsed.description,
    imageUri: parsed.imageUri,
    ...(parsed.collectionId ? { collectionId: parsed.collectionId } : {}),
    createdAt: currentHeight
  };
  routeEligibleTxFee(state, tx, config);
}

export function applyNftTransfer(
  state: ChainState,
  tx: Transaction,
  config: NetworkConfig
): void {
  const from = ensureAccount(state, tx.from);
  if (from.nonce !== tx.nonce) {
    throw new Error("Invalid nonce");
  }
  if (!Number.isFinite(tx.fee) || tx.fee < 0) {
    throw new Error("Invalid transaction fee");
  }
  if (from.balance < tx.fee) {
    throw new Error("Insufficient native balance for fee");
  }
  const nftId = String(tx.payload?.nftId ?? "").trim().toLowerCase();
  state.nfts ??= {};
  const nft = state.nfts[nftId];
  if (!nft) {
    throw new Error(`NFT not found: ${nftId}`);
  }
  if (nft.owner.toLowerCase() !== tx.from.toLowerCase()) {
    throw new Error("Not NFT owner");
  }
  const recipient = String(tx.to ?? "").trim();
  if (!recipient || !isCanonicalAddress(recipient) || recipient.toLowerCase() === tx.from.toLowerCase()) {
    throw new Error("Invalid NFT transfer recipient");
  }
  ensureAccount(state, recipient);
  from.balance -= tx.fee;
  from.balances[NATIVE_ASSET_ID] = from.balance;
  from.nonce += 1;
  nft.owner = recipient;
  routeEligibleTxFee(state, tx, config);
}

export function applyCurveBuy(
  state: ChainState,
  tx: Transaction,
  config: NetworkConfig
): void {
  const from = ensureAccount(state, tx.from);
  if (from.nonce !== tx.nonce) {
    throw new Error("Invalid nonce");
  }
  const assetId = String(tx.payload?.assetId ?? tx.assetId ?? "").trim().toLowerCase();
  const nativeAmount = Number(tx.payload?.nativeAmount ?? tx.payload?.nativeIn ?? tx.amount ?? 0);
  const minTokensOut = Number(tx.payload?.minTokensOut ?? 0);

  const curve = ownGet(state.curves, assetId);
  if (!curve) {
    throw new Error(`Bonding curve not found for asset: ${assetId}`);
  }
  if (curve.status !== "active") {
    throw new Error("Bonding curve is not active");
  }
  if (from.balance < nativeAmount + tx.fee) {
    throw new Error("Insufficient native balance for buy amount and fee");
  }

  if (securityUpgradeActive(config, inclusionBlockHeight(state))) BondingCurveEngine.upgradePrecision(curve);
  const buyResult = BondingCurveEngine.calculateBuy(curve, nativeAmount, minTokensOut);

  from.balance -= nativeAmount + tx.fee;
  from.balances[NATIVE_ASSET_ID] = from.balance;
  from.nonce += 1;

  const currentTokenBal = getAccountBalance(from, assetId);
  setAccountBalance(from, assetId, currentTokenBal + buyResult.tokensOut);

  curve.currentTokenReserve = buyResult.newCurrentTokenReserve;
  curve.virtualTokenReserve = buyResult.newVirtualTokenReserve;
  curve.virtualNativeReserve = buyResult.newVirtualNativeReserve;
  curve.actualNativeReserve = buyResult.newActualNativeReserve;

  // Trading fee is eligible N and, on the live path, Model A. tx.fee is a separate protocol fee.
  routeTradingFee(state, buyResult.fee, config);
  routeEligibleTxFee(state, tx, config);
  if ((securityUpgradeActive(config, inclusionBlockHeight(state)) ? Number.isFinite(buyResult.fee) : Number.isSafeInteger(buyResult.fee)) && buyResult.fee > 0) {
    noteGrowthEpoch(state, tx.from, "N");
  }

  // Check migration trigger
  if (buyResult.isMigrationTriggered) {
    const currentHeight = state.chain.length > 0 ? state.chain[state.chain.length - 1]!.header.height : 0;
    executeMigration(state, assetId, currentHeight);
  }
}

export function applyCurveSell(
  state: ChainState,
  tx: Transaction,
  config: NetworkConfig
): void {
  const from = ensureAccount(state, tx.from);
  if (from.nonce !== tx.nonce) {
    throw new Error("Invalid nonce");
  }
  const assetId = String(tx.payload?.assetId ?? tx.assetId ?? "").trim().toLowerCase();
  const tokenAmount = Number(tx.payload?.tokenAmount ?? tx.payload?.tokensIn ?? tx.amount ?? 0);
  const minNativeOut = Number(tx.payload?.minNativeOut ?? 0);

  const curve = ownGet(state.curves, assetId);
  if (!curve) {
    throw new Error(`Bonding curve not found for asset: ${assetId}`);
  }
  if (curve.status !== "active") {
    throw new Error("Bonding curve is not active");
  }
  if (from.balance < tx.fee) {
    throw new Error("Insufficient native balance for transaction fee");
  }
  const fromTokenBal = getAccountBalance(from, assetId);
  if (fromTokenBal < tokenAmount) {
    throw new Error(`Insufficient token balance to sell: ${assetId}`);
  }

  if (securityUpgradeActive(config, inclusionBlockHeight(state))) BondingCurveEngine.upgradePrecision(curve);
  const sellResult = BondingCurveEngine.calculateSell(curve, tokenAmount, minNativeOut);

  setAccountBalance(from, assetId, fromTokenBal - tokenAmount);

  from.balance = from.balance - tx.fee + sellResult.netNativeOut;
  from.balances[NATIVE_ASSET_ID] = from.balance;
  from.nonce += 1;

  curve.virtualTokenReserve = sellResult.newVirtualTokenReserve;
  curve.virtualNativeReserve = sellResult.newVirtualNativeReserve;
  curve.actualNativeReserve = sellResult.newActualNativeReserve;
  curve.currentTokenReserve = sellResult.newCurrentTokenReserve;

  routeTradingFee(state, sellResult.fee, config);
  routeEligibleTxFee(state, tx, config);
  if ((securityUpgradeActive(config, inclusionBlockHeight(state)) ? Number.isFinite(sellResult.fee) : Number.isSafeInteger(sellResult.fee)) && sellResult.fee > 0) {
    noteGrowthEpoch(state, tx.from, "N");
  }
}

export function applyCreatorClaim(
  state: ChainState,
  tx: Transaction,
  config: NetworkConfig
): void {
  const from = ensureAccount(state, tx.from);
  if (from.nonce !== tx.nonce) {
    throw new Error("Invalid nonce");
  }
  if (from.balance < tx.fee) {
    throw new Error("Insufficient native balance for transaction fee");
  }
  const assetId = String(tx.payload?.assetId ?? tx.assetId ?? "").trim().toLowerCase();
  const vesting = state.vesting[assetId];
  if (!vesting) {
    throw new Error(`No creator vesting found for asset: ${assetId}`);
  }
  if (tx.from !== vesting.creator) {
    throw new Error("Only the token creator can claim vested tokens");
  }
  const currentHeight = state.chain.length > 0 ? state.chain[state.chain.length - 1]!.header.height : 0;
  const claimable = getClaimableVestedTokens(vesting, currentHeight);
  if (claimable <= 0) {
    throw new Error("No claimable vested tokens at this block height");
  }

  from.balance -= tx.fee;
  from.balances[NATIVE_ASSET_ID] = from.balance;
  from.nonce += 1;

  vesting.claimedAmount += claimable;
  vesting.vestedAmount = calculateVestedAmount(vesting, currentHeight);

  const currentTokenBal = getAccountBalance(from, assetId);
  setAccountBalance(from, assetId, currentTokenBal + claimable);
  routeEligibleTxFee(state, tx, config);
}

/** Protocol-controlled destinations a promo award may never be routed to. */
function forbiddenPromoRecipients(config: NetworkConfig): string[] {
  const bootstrap = (config.bootstrapAddress ?? "").trim().toLowerCase();
  return [FAUCET_ADDRESS.toLowerCase(), ...(bootstrap ? [bootstrap] : [])];
}

/**
 * `promoAward` / `promoClaim` / `promoReturn` — the node-side `PromoRewardsVault` operations
 * (`docs/TOKEN-ECONOMY.md` §4a). Gated on the coordinated `promoShareUpgrade` height; a pool can
 * only exist above it, so these transactions are unreachable on historical blocks.
 *
 * The economic clock is the head height, the same one `applyCreatorClaim` and `applyTokenCreate`
 * use for creator vesting, so a promo award and the creator allocation vest on one timeline.
 */
export function applyPromoTransaction(
  state: ChainState,
  tx: Transaction,
  config: NetworkConfig
): void {
  if (!promoShareActive(config, inclusionBlockHeight(state))) {
    throw new Error("Creator promo share is not active on this network");
  }
  const from = ensureAccount(state, tx.from);
  if (from.nonce !== tx.nonce) {
    throw new Error("Invalid nonce");
  }
  if (!Number.isFinite(tx.fee) || tx.fee < 0) {
    throw new Error("Invalid transaction fee");
  }
  if (from.balance < tx.fee) {
    throw new Error("Insufficient native balance for transaction fee");
  }
  const assetId = canonicalizeAssetId(String(tx.payload?.assetId ?? tx.assetId ?? "").trim());
  const pool = ownGet(state.promoPools, assetId);
  if (!pool) {
    throw new Error(`No promo pool found for asset: ${assetId}`);
  }
  const currentHeight = state.chain.length > 0 ? state.chain[state.chain.length - 1]!.header.height : 0;

  if (tx.type === "promoAward") {
    const recipient = String(tx.payload?.recipient ?? tx.to ?? "").trim();
    if (!isCanonicalAddress(recipient)) {
      throw new Error("Invalid promo recipient address");
    }
    const amount = Number(tx.payload?.amount ?? tx.amount ?? 0);
    awardPromo(pool, tx.from, recipient, amount, currentHeight, forbiddenPromoRecipients(config));
    // The tokens stay in the pool; `promoClaim` moves them as they vest.
  } else if (tx.type === "promoClaim") {
    const claimable = claimPromo(pool, tx.from, currentHeight);
    setAccountBalance(from, assetId, getAccountBalance(from, assetId) + claimable);
  } else if (tx.type === "promoReturn") {
    // Permissionless by rule: anyone may close the window, nothing returns to the creator.
    const unused = returnUnusedPromo(pool, currentHeight);
    if (unused > 0) {
      allocateToCommunityPool(state.communityPool, assetId, unused);
    }
  } else {
    throw new Error(`Unsupported promo transaction type: ${tx.type}`);
  }

  from.balance -= tx.fee;
  from.balances[NATIVE_ASSET_ID] = from.balance;
  from.nonce += 1;
  if (Number.isFinite(tx.fee) && tx.fee > 0) {
    routeEligibleTxFee(state, tx, config);
  }
}

function applyProposalParams(config: NetworkConfig, params: GovernanceProposal["params"], noIssuance = false): void {
  if (noIssuance && params.epochBaseIssuance !== undefined) throw new Error("Protocol issuance is disabled");
  for (const key of ["minStake", "epochBaseIssuance", "lightValidatorWeightMultiplier"] as const) {
    const value = params[key];
    if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER)) throw new Error("Invalid governance parameter");
  }
  if (typeof params.minStake === "number") {
    config.minStake = params.minStake;
  }
  if (typeof params.epochBaseIssuance === "number") {
    config.epochBaseIssuance = params.epochBaseIssuance;
  }
  if (typeof params.lightValidatorWeightMultiplier === "number") {
    config.lightValidatorWeightMultiplier = params.lightValidatorWeightMultiplier;
  }
}

export function verifySlashEvidence(state: ChainState, evidence: SlashEvidence): boolean {
  if (!evidence?.validator || !evidence.blockHashA || !evidence.blockHashB) {
    return false;
  }
  if (evidence.blockHashA === evidence.blockHashB) {
    return false;
  }
  if (evidence.type !== "double_sign" && evidence.type !== "conflicting_attestation") {
    return false;
  }
  if (evidence.type === "conflicting_attestation") {
    const keyA = `${evidence.height}:${evidence.validator}:${evidence.blockHashA}`;
    const keyB = `${evidence.height}:${evidence.validator}:${evidence.blockHashB}`;
    return Boolean(state.attestationBallots[keyA] && state.attestationBallots[keyB]);
  }

  const { blockA, blockB } = evidence;
  return Boolean(blockA?.header && blockB?.header && Array.isArray(blockA.transactions) && Array.isArray(blockB.transactions) && blockA.hash === evidence.blockHashA && blockB.hash === evidence.blockHashB &&
    blockA.header.height === evidence.height && blockB.header.height === evidence.height &&
    blockA.header.chainId === (state.networkConfig?.chainId ?? DEFAULT_CONFIG.chainId) && blockB.header.chainId === blockA.header.chainId &&
    blockA.header.proposer === evidence.validator && blockB.header.proposer === evidence.validator &&
    blockA.hash === hashJson({header:blockA.header,transactions:blockA.transactions}) &&
    blockB.hash === hashJson({header:blockB.header,transactions:blockB.transactions}) &&
    verifyBlockSignature(blockA,evidence.validator) && verifyBlockSignature(blockB,evidence.validator));
}

function applySlash(
  state: ChainState,
  config: NetworkConfig,
  address: string,
  fraction: number,
  jailUntilEpoch: number,
  reporter?: string
): number {
  const validator = state.validators[address];
  if (!validator) {
    return 0;
  }
  validator.status = "slashed";
  validator.jailUntilEpoch = jailUntilEpoch;
  // B10 (behind the upgrade): `validator.stake * fraction` and the reporter's cut were plain
  // float multiplication, so a slash could credit/retain a sub-atom amount M04-4 then refuses to
  // transfer. Round the pre-upgrade (possibly non-atom-exact) stake to the nearest atom rather
  // than requiring exactness — a legacy stake joined before this upgrade may not be atom-bound —
  // then floor every further split in atoms, deterministically.
  if (consensusUpgrade1Active(config, inclusionBlockHeight(state))) {
    const stakeAtoms = Math.round(validator.stake * PPL_SCALE);
    const slashedAtoms = Math.floor(stakeAtoms * fraction);
    validator.stake = Math.max(0, stakeAtoms - slashedAtoms) / PPL_SCALE;
    if (reporter && reporter !== address && slashedAtoms > 0) {
      const reporterAtoms = Math.floor(slashedAtoms * SLASH_REPORTER_SHARE);
      if (reporterAtoms > 0) {
        const rep = ensureAccount(state, reporter);
        rep.balance += reporterAtoms / PPL_SCALE;
        rep.balances[NATIVE_ASSET_ID] = rep.balance;
      }
    }
    return slashedAtoms / PPL_SCALE;
  }
  const slashed = validator.stake * fraction;
  validator.stake = Math.max(0, validator.stake - slashed);
  if (reporter && reporter !== address && slashed > 0) {
    const rep = ensureAccount(state, reporter);
    rep.balance += slashed * SLASH_REPORTER_SHARE;
    rep.balances[NATIVE_ASSET_ID] = rep.balance;
  }
  return slashed;
}

export function activateValidators(state: ChainState, config: NetworkConfig): void {
  for (const validator of Object.values(state.validators)) {
    if (securityUpgradeActive(config, inclusionBlockHeight(state)) && validator.status !== "active" && !config.securityUpgrade!.validatorAllowlist.includes(validator.address)) continue;
    if (
      validator.status === "joining" &&
      state.epoch - (validator.joinedAtEpoch ?? 0) >= config.warmupEpochs
    ) {
      validator.status = "active";
    }
    if (
      validator.status === "slashed" &&
      validator.jailUntilEpoch !== undefined &&
      state.epoch >= validator.jailUntilEpoch &&
      validator.stake >= config.minStake
    ) {
      validator.status = "active";
      validator.jailUntilEpoch = undefined;
    }
  }
}

function activeValidatorWeight(validator: Validator, config: NetworkConfig): number {
  const weight = validator.nodeKind === "light" ? config.lightValidatorWeightMultiplier : 1;
  return validator.stake * weight;
}

function totalActiveStake(state: ChainState, config: NetworkConfig): number {
  return Object.values(state.validators)
    .filter((validator) => validator.status === "active")
    .reduce((sum, validator) => sum + activeValidatorWeight(validator, config), 0);
}

/**
 * M10-2: a vote's weight used to be frozen at cast time (`state.attestationVotes[h][addr].weight`),
 * so a validator who later unstaked, left or was slashed kept its old voting power forever. Behind
 * the upgrade, only validators who are still `active` right now count, weighted by their current
 * stake; a stale/joining/slashed vote contributes nothing to quorum.
 */
function currentVoteWeight(
  state: ChainState,
  config: NetworkConfig,
  voter: string,
  storedWeight: number,
  useCurrentStakeOnly: boolean
): number {
  if (!useCurrentStakeOnly) {
    return storedWeight;
  }
  const validator = state.validators[voter];
  if (!validator || validator.status !== "active") {
    return 0;
  }
  return activeValidatorWeight(validator, config);
}

export function updateFinality(state: ChainState, config: NetworkConfig): void {
  const useCurrentStakeOnly = consensusUpgrade1Active(config, inclusionBlockHeight(state));
  const activeStake = totalActiveStake(state, config);
  // Without active stake there is no attestation quorum; keep a shallow lag-based floor only.
  if (activeStake <= 0) {
    state.finalizedHeight = Math.max(0, state.chain.at(-3)?.header.height ?? 0);
    return;
  }

  const heights = Object.keys(state.attestationVotes)
    .map(Number)
    .sort((a, b) => a - b);
  for (const height of heights) {
    if (height <= state.finalizedHeight) {
      continue;
    }
    // Only count votes that still agree on one leading hash (by weight).
    const byHash = new Map<string, number>();
    for (const [voter, vote] of Object.entries(state.attestationVotes[height] ?? {})) {
      const weight = currentVoteWeight(state, config, voter, vote.weight, useCurrentStakeOnly);
      if (weight <= 0) continue;
      byHash.set(vote.blockHash, (byHash.get(vote.blockHash) ?? 0) + weight);
    }
    let best = 0;
    for (const weight of byHash.values()) {
      best = Math.max(best, weight);
    }
    if (best / activeStake >= config.attestationFinalityThreshold) {
      state.finalizedHeight = height;
    } else {
      // Do not skip gaps — finality must advance contiguously via quorum.
      break;
    }
  }
}

export function countAttestationQuorumHeights(state: ChainState, config: NetworkConfig): number {
  const useCurrentStakeOnly = consensusUpgrade1Active(config, inclusionBlockHeight(state));
  const activeStake = totalActiveStake(state, config);
  if (activeStake <= 0) {
    return 0;
  }
  let count = 0;
  for (const votes of Object.values(state.attestationVotes)) {
    const total = Object.entries(votes).reduce(
      (sum, [voter, vote]) => sum + currentVoteWeight(state, config, voter, vote.weight, useCurrentStakeOnly),
      0
    );
    if (total / activeStake >= config.attestationFinalityThreshold) {
      count += 1;
    }
  }
  return count;
}

export function recordMissedProposal(state: ChainState, expectedProposer: string): void {
  const validator = state.validators[expectedProposer];
  if (!validator || validator.status !== "active") {
    return;
  }
  validator.proposedMisses = (validator.proposedMisses ?? 0) + 1;
  validator.uptimeScore = Math.max(0.1, validator.uptimeScore - 0.05);
  state.missedProposalCount = (state.missedProposalCount ?? 0) + 1;
}

/** Normalize legacy numeric attestation votes after loading persisted state. */
export function normalizeAttestationVotes(state: ChainState): void {
  state.attestationBallots ??= {};
  state.missedProposalCount ??= 0;
  for (const [heightKey, votes] of Object.entries(state.attestationVotes ?? {})) {
    for (const [address, value] of Object.entries(votes)) {
      if (typeof value === "number") {
        const block = state.chain.find((item) => item.header.height === Number(heightKey));
        votes[address] = {
          weight: value,
          blockHash: block?.hash ?? ""
        };
      }
    }
  }
}

/**
 * Drop ancient blocks from RAM and trim vote / seen-hash maps.
 * Always keeps genesis (height 0) when present and the newest `keepBlocks` tips.
 */
export function trimChainWindow(
  state: ChainState,
  keepBlocks: number = CHAIN_WINDOW_BLOCKS
): { kept: number; prunedBefore: number } {
  if (state.chain.length === 0) {
    return { kept: 0, prunedBefore: 0 };
  }
  const head = state.chain[state.chain.length - 1]!;
  const keepFrom = Math.max(1, head.header.height - Math.max(1, keepBlocks) + 1);
  const genesis = state.chain[0]?.header.height === 0 ? state.chain[0] : null;
  const recent = state.chain.filter((block) => block.header.height >= keepFrom);
  state.chain = genesis && keepFrom > 0 ? [genesis, ...recent.filter((b) => b.header.height > 0)] : recent;

  for (const heightKey of Object.keys(state.attestationVotes)) {
    if (Number(heightKey) < keepFrom) {
      delete state.attestationVotes[Number(heightKey)];
    }
  }
  for (const ballotKey of Object.keys(state.attestationBallots)) {
    const height = Number(ballotKey.split(":")[0] ?? "");
    if (!Number.isNaN(height) && height < keepFrom) {
      delete state.attestationBallots[ballotKey];
    }
  }
  for (const seenKey of Object.keys(state.seenBlockHashes)) {
    const height = Number(seenKey.split(":")[0] ?? "");
    if (!Number.isNaN(height) && height > 0 && height < keepFrom) {
      delete state.seenBlockHashes[seenKey];
    }
  }

  return { kept: state.chain.length, prunedBefore: keepFrom };
}

/** Compact state for checkpoint blobs: tip only + accounts/validators (no full history). */
export function compactChainStateForCheckpoint(state: ChainState): ChainState {
  const tip = state.chain[state.chain.length - 1];
  const genesis = state.chain[0]?.header.height === 0 ? state.chain[0] : null;
  const chain = tip
    ? genesis && tip.header.height > 0
      ? [genesis, tip]
      : [tip]
    : [];
  return {
    accounts: structuredClone(state.accounts),
    validators: structuredClone(state.validators),
    participants: structuredClone(state.participants),
    contributionEpochs: structuredClone(state.contributionEpochs),
    networkActivityEpochs: structuredClone(state.networkActivityEpochs),
    growthPool: structuredClone(state.growthPool),
    growthEpochInflow: structuredClone(state.growthEpochInflow),
    growthEpochBudget: structuredClone(state.growthEpochBudget),
    growthAssigned: structuredClone(state.growthAssigned),
    growthClaims: structuredClone(state.growthClaims),
    growthSettledEpochs: structuredClone(state.growthSettledEpochs),
    growthSettlementFailures: structuredClone(state.growthSettlementFailures),
    feeLiquidityEcosystem: state.feeLiquidityEcosystem,
    pendingValidatorFees: state.pendingValidatorFees,
    lastEpochReward: structuredClone(state.lastEpochReward),
    networkConfig: structuredClone(state.networkConfig),
    appliedSlashEvidence: structuredClone(state.appliedSlashEvidence ?? {}),
    mempool: [],
    chain,
    epoch: state.epoch,
    proposals: structuredClone(state.proposals),
    attestationVotes: {},
    attestationBallots: {},
    finalizedHeight: state.finalizedHeight,
    seenBlockHashes: tip ? { [`${tip.header.height}:${tip.hash}`]: tip.header.proposer } : {},
    missedProposalCount: state.missedProposalCount ?? 0,
    stateRevision: state.stateRevision,
    assets: structuredClone(state.assets),
    communityPool: structuredClone(state.communityPool),
    treasury: structuredClone(state.treasury),
    burned: structuredClone(state.burned),
    curves: structuredClone(state.curves),
    vesting: structuredClone(state.vesting),
    liquidityReserves: structuredClone(state.liquidityReserves),
    ecosystemReserves: structuredClone(state.ecosystemReserves),
    launchReserves: structuredClone(state.launchReserves),
    liquidityPools: structuredClone(state.liquidityPools),
    nfts: structuredClone(state.nfts ?? {}),
    contracts: structuredClone(state.contracts ?? {}),
    contractReceipts: structuredClone(state.contractReceipts ?? {}),
    contractMeta: structuredClone(state.contractMeta ?? {})
  };
}

/** Record a seen block tip for double-sign detection; returns evidence if conflict found. */
export function noteSeenBlock(state: ChainState, block: Block): SlashEvidence | null {
  if (!block?.header || !verifyBlockSignature(block, block.header.proposer) ||
      block.hash !== hashJson({header:block.header,transactions:block.transactions})) return null;
  const key = `${block.header.height}:${block.hash}`;
  state.seenBlockHashes[key] = block.header.proposer;
  for (const [seenKey, proposer] of Object.entries(state.seenBlockHashes)) {
    const sep = seenKey.indexOf(":");
    if (sep < 0) {
      continue;
    }
    const height = Number(seenKey.slice(0, sep));
    const hash = seenKey.slice(sep + 1);
    if (
      height === block.header.height &&
      hash !== block.hash &&
      proposer === block.header.proposer &&
      block.header.proposer !== "bootstrap-validator" &&
      block.header.proposer !== "genesis"
    ) {
      return {
        type: "double_sign",
        validator: block.header.proposer,
        height: block.header.height,
        blockHashA: hash,
        blockHashB: block.hash,
        blockA: state.chain.find((candidate) => candidate.hash === hash),
        blockB: block
      };
    }
  }
  return null;
}

async function applyIncludedTransaction(
  state: ChainState,
  tx: Transaction,
  config: NetworkConfig
): Promise<void> {
  recordTransactionPublicKey(state, tx);
  await applyTransaction(state, tx, config);
  const chargedTypes = ["transfer", "joinValidator", "proposal", "tokenCreate", "curveBuy", "curveSell", "creatorClaim", "nftMint", "nftTransfer", "contractDeploy", "contractCall", "ammCreatePool", "ammAddLiquidity", "ammRemoveLiquidity", "ammSwap", "promoAward", "promoClaim", "promoReturn"];
  if (chargedTypes.includes(tx.type) && !txFeeUsesLiveModelA(tx, config)) {
    state.pendingValidatorFees = (state.pendingValidatorFees ?? 0) + tx.fee;
  }
}

function finalizeBlockState(state: ChainState, config: NetworkConfig, height: number): void {
  maybeApplyEvmAddressMigration(state, height);
  if (securityUpgradeActive(config, height)) config.epochBaseIssuance = 0;
  activateValidators(state, config);
  updateFinality(state, config);
  closeGrowthEpochIfBoundary(state, config);
  if (height % 10 === 0) {
    state.epoch += 1;
    activateValidators(state, config);
    const reward = distributeEpochRewards(state, config, state.pendingValidatorFees ?? 0);
    state.lastEpochReward = reward;
    if (sumDistributedRewards(reward) > 0) state.pendingValidatorFees = 0;
  }
  state.networkConfig = structuredClone(config);
}

export async function buildBlock(state: ChainState, proposer: string, config: NetworkConfig, signingKey?: string): Promise<Block> {
  const originalIds = new Set(state.mempool.map(tx => tx.id));
  const draft = structuredClone(state);
  const nextConfig = structuredClone(config);
  const block = await buildBlockDraft(draft, proposer, nextConfig, signingKey);
  const arrivals = state.mempool.filter(tx => !originalIds.has(tx.id));
  Object.assign(state, draft);
  state.mempool.push(...arrivals);
  Object.assign(config, nextConfig);
  return block;
}
async function buildBlockDraft(state: ChainState, proposer: string, config: NetworkConfig, signingKey?: string): Promise<Block> {
  const head = state.chain[state.chain.length - 1];
  const now = Date.now();
  const timestamp = securityUpgradeActive(config, head.header.height + 1) ? Math.max(now, head.header.timestamp + 1) : now;
  if (timestamp > now + MAX_FUTURE_BLOCK_MS) throw new Error("Parent block is too far in the future");
  return withExecutionEnvAsync(
    {
      timestamp,
      blockNumber: head.header.height + 1,
      proposer,
      chainId: config.chainId,
      remainingBlockGas: contractBlockGasLimit(),
      consensusUpgrade1: consensusUpgrade1Active(config, head.header.height + 1)
    },
    async () => {
      const transactions: Transaction[] = [];

      let pending = [...state.mempool].sort(compareMempoolPriority);
      while (transactions.length < MAX_TRANSACTIONS_PER_BLOCK && pending.length > 0) {
        let progress = false;
        const deferred: Transaction[] = [];
        for (const tx of pending) {
          if (transactions.length >= MAX_TRANSACTIONS_PER_BLOCK) {
            deferred.push(tx);
            continue;
          }
          let admissionPassed = false;
          try {
            // A stale/unfunded nonce must not trigger a clone of the entire state.
            if (tx.nonce !== (state.accounts[tx.from]?.nonce ?? 0)) continue;
            validateMempoolSpending(state, tx);
            admissionPassed = true;
            await applyIncludedTransaction(state, tx, config);
            transactions.push(tx);
            progress = true;
          } catch (error) {
            const message = error instanceof Error ? error.message : "";
            if (admissionPassed && isRecoverableMempoolError(message) && !/nonce/i.test(message)) {
              deferred.push(tx);
            }
          }
        }
        pending = deferred;
        if (!progress) {
          break;
        }
      }
      pending.sort(compareMempoolPriority);
      state.mempool = pending;

      finalizeBlockState(state, config, head.header.height + 1);

      const header: BlockHeader = {
        chainId: config.chainId,
        protocolVersion: 2,
        height: head.header.height + 1,
        previousHash: head.hash,
        proposer,
        timestamp,
        stateRoot: computeStateRoot(state)
      };

      let block: Block = {
        header,
        transactions,
        hash: hashJson({ header, transactions })
      };
      const key = signingKey ?? (proposer === "bootstrap-validator" ? process.env.BOOTSTRAP_PRIVATE_KEY : undefined);
      if (key) block = signBlock(block, key);
      state.chain.push(block);
      state.seenBlockHashes[`${block.header.height}:${block.hash}`] = proposer;

      return block;
    }
  );
}

export function validateBlock(previous: Block, block: Block): boolean {
  if (block?.header?.timestamp > Date.now() + MAX_FUTURE_BLOCK_MS) return false;
  if (!block?.header || !Array.isArray(block.transactions) || block.transactions.length > MAX_TRANSACTIONS_PER_BLOCK ||
      !Number.isSafeInteger(block.header.timestamp) || block.header.timestamp < previous.header.timestamp) return false;
  if (block.header.height !== previous.header.height + 1) {
    return false;
  }
  if (block.header.previousHash !== previous.hash) {
    return false;
  }
  return block.hash === hashJson({ header: block.header, transactions: block.transactions });
}

export function selectProposer(state: ChainState, slot?: number): string {
  const active = Object.values(state.validators).filter((v) => v.status === "active");
  if (active.length === 0) {
    return "bootstrap-validator";
  }
  const totalStake = active.reduce((sum, v) => sum + v.stake, 0);
  const headHeight = state.chain[state.chain.length - 1].header.height;
  const seed = (slot ?? headHeight + 1) % Math.max(1, totalStake);
  let cursor = 0;
  for (const validator of active) {
    cursor += validator.stake;
    if (seed < cursor) {
      return validator.address;
    }
  }
  return active[0]!.address;
}

export async function tryApplyRemoteBlock(state: ChainState, block: Block, config: NetworkConfig): Promise<boolean> {
  const draft = structuredClone(state);
  const nextConfig = structuredClone(config);
  if (!(await tryApplyRemoteBlockDraft(draft, block, nextConfig))) return false;
  const included = new Set(block.transactions.map(tx => tx.id));
  draft.mempool = state.mempool.filter(tx => !included.has(tx.id));
  Object.assign(state, draft);
  Object.assign(config, nextConfig);
  return true;
}

async function tryApplyRemoteBlockDraft(
  state: ChainState,
  block: Block,
  config: NetworkConfig
): Promise<boolean> {
  const head = state.chain[state.chain.length - 1];
  if (!block?.header || !Array.isArray(block.transactions)) return false;
  const proposer = selectProposer(state, block.header.height);
  if (block.header.chainId !== config.chainId || block.header.protocolVersion !== 2 || block.header.proposer !== proposer ||
      !verifyBlockSignature(block, proposer === "bootstrap-validator" ? config.bootstrapAddress ?? "" : proposer)) return false;
  if (block.header.height < head.header.height) {
    return false;
  }
  if (block.header.height === head.header.height) {
    // Fork tip at same height — keep longer-hash winner for simple fork-choice later
    return false;
  }
  if (block.header.height > head.header.height + 1) {
    return false;
  }
  if (!validateBlock(head, block)) {
    return false;
  }

  const originalState = structuredClone(state);
  const originalConfig = structuredClone(config);
  const rollback = () => {
    for (const key of Object.keys(state)) delete (state as unknown as Record<string, unknown>)[key];
    Object.assign(state, originalState);
    Object.assign(config, originalConfig);
  };

  return withExecutionEnvAsync(
    {
      timestamp: block.header.timestamp,
      blockNumber: block.header.height,
      proposer: block.header.proposer,
      chainId: config.chainId,
      remainingBlockGas: contractBlockGasLimit(),
      consensusUpgrade1: consensusUpgrade1Active(config, block.header.height)
    },
    async () => {
      for (const tx of block.transactions) {
        if (tx.chainId !== config.chainId || !verifyTransaction(tx)) {
          rollback();
          return false;
        }
        try {
          await applyIncludedTransaction(state, tx, config);
        } catch {
          rollback();
          return false;
        }
      }

      try {
        finalizeBlockState(state, config, block.header.height);
      } catch {
        rollback();
        return false;
      }

      if (block.header.stateRoot !== computeStateRoot(state)) {
        rollback();
        return false;
      }

      state.chain.push(block);
      state.seenBlockHashes[`${block.header.height}:${block.hash}`] = block.header.proposer;

      return true;
    }
  );
}

function preservesFinalizedHistory(local: ChainState, candidate: ChainState): boolean {
  if (local.finalizedHeight === 0) return candidate.chain[0]?.hash === local.chain[0]?.hash;
  const localBlock = local.chain.find(block => block.header.height === local.finalizedHeight);
  const remoteBlock = candidate.chain.find(block => block.header.height === local.finalizedHeight);
  // If history needed to prove ancestry was pruned, fail closed.
  return Boolean(localBlock && remoteBlock && localBlock.hash === remoteBlock.hash);
}

export async function chooseFork(local: ChainState, remoteChain: Block[], config: NetworkConfig = DEFAULT_CONFIG): Promise<ChainState | null> {
  const localHead = local.chain.at(-1)!;
  if (!remoteChain.length || remoteChain.at(-1)!.header.height <= localHead.header.height) return null;
  const index = remoteChain.findIndex(block => block.hash === localHead.hash);
  if (index >= 0) {
    const state = structuredClone(local);
    // Both coordinated activations are re-asserted from the local (operator-configured) config:
    // a height persisted in `state.networkConfig` must never outvote the one this node is run
    // with, or a corrected/withdrawn schedule would keep applying on replay (CHAIN-H2).
    const nextConfig = structuredClone({ ...config, ...state.networkConfig, ...(config.securityUpgrade ? { securityUpgrade: config.securityUpgrade } : {}), ...(config.consensusUpgrade1 ? { consensusUpgrade1: config.consensusUpgrade1 } : {}) });
    for (const block of remoteChain.slice(index + 1)) {
      if (!(await tryApplyRemoteBlock(state, block, nextConfig))) return null;
    }
    return state.chain.at(-1)!.header.height > localHead.header.height ? state : null;
  }
  const replayed = await validateAndReplayChain(remoteChain, structuredClone(config));
  return replayed && replayed.chain.at(-1)!.header.height > localHead.header.height && preservesFinalizedHistory(local,replayed) ? replayed : null;
}

export async function replayChainFromCheckpoint(
  checkpointState: ChainState,
  checkpointHeight: number,
  remoteChain: Block[],
  config: NetworkConfig = DEFAULT_CONFIG
): Promise<ChainState | null> {
  const head = checkpointState.chain[checkpointState.chain.length - 1];
  if (!head || head.header.height !== checkpointHeight) {
    return null;
  }
  const state = structuredClone(checkpointState);
  config = structuredClone({ ...config, ...state.networkConfig, ...(config.securityUpgrade ? { securityUpgrade: config.securityUpgrade } : {}), ...(config.consensusUpgrade1 ? { consensusUpgrade1: config.consensusUpgrade1 } : {}) });
  const sorted = [...remoteChain].sort((a, b) => a.header.height - b.header.height);
  for (const block of sorted) {
    if (block.header.height <= checkpointHeight) {
      continue;
    }
    if (!(await tryApplyRemoteBlock(state, block, config))) {
      return null;
    }
  }
  return state.chain.at(-1)!.header.height > checkpointHeight ? state : null;
}

export async function chooseForkWithCheckpoint(
  local: ChainState,
  remoteChain: Block[],
  config: NetworkConfig = DEFAULT_CONFIG,
  checkpoint?: { state: ChainState; height: number }
): Promise<ChainState | null> {
  const direct = await chooseFork(local, remoteChain, config);
  if (direct) {
    return direct;
  }
  if (!checkpoint) {
    return null;
  }
  const replayed = await replayChainFromCheckpoint(
    checkpoint.state,
    checkpoint.height,
    remoteChain,
    config
  );
  if (!replayed || replayed.chain.at(-1)!.header.height <= local.chain.at(-1)!.header.height || !preservesFinalizedHistory(local, replayed)) {
    return null;
  }
  return replayed;
}

export function distributeEpochRewards(
  state: ChainState,
  config: NetworkConfig,
  feePool: number
): RewardDistribution {
  const splitConfig = config.feeSplit ?? LEGACY_FEE_SPLIT;
  const split = FeeSplitter.split(feePool, splitConfig);

  // Allocate Community Pool share if configured
  if (split.communityAmount > 0) {
    allocateToCommunityPool(state.communityPool, NATIVE_ASSET_ID, split.communityAmount);
  }

  // Allocate Treasury share if configured
  if (split.treasuryAmount > 0) {
    state.treasury ??= {};
    state.treasury[NATIVE_ASSET_ID] = (state.treasury[NATIVE_ASSET_ID] ?? 0) + split.treasuryAmount;
  }

  // Track burned fees if configured
  if (split.burnAmount > 0) {
    state.burned ??= {};
    state.burned[NATIVE_ASSET_ID] = (state.burned[NATIVE_ASSET_ID] ?? 0) + split.burnAmount;
  }

  const feeDetails: FeeDistributionDetails = {
    totalCollectedFees: feePool,
    validatorFees: split.validatorAmount,
    communityPoolFees: split.communityAmount,
    treasuryFees: split.treasuryAmount,
    liquidityFees: split.liquidityAmount,
    burnedFees: split.burnAmount
  };

  const active = Object.values(state.validators).filter((v) => v.status === "active");
  if (active.length === 0) {
    return {
      epoch: state.epoch,
      totalReward: 0,
      rewards: {},
      referralPayouts: {},
      protocolIssuance: 0,
      feeReward: 0,
      feeDistribution: feeDetails
    };
  }

  const protocolIssuance = securityUpgradeActive(config, inclusionBlockHeight(state)) ? 0 : config.epochBaseIssuance;
  const validatorFeeReward = split.validatorAmount;
  const totalReward = protocolIssuance + validatorFeeReward;
  const weights: Record<string, number> = {};

  for (const validator of active) {
    const nodeWeight = validator.nodeKind === "light" ? config.lightValidatorWeightMultiplier : 1;
    weights[validator.address] =
      validator.stake * validator.uptimeScore * validator.attestationScore * nodeWeight;
  }

  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0) || 1;
  const share = Math.min(0.2, Math.max(0, config.referralShare ?? 0));
  let rewards: Record<string, number>;
  const referralPayouts: Record<string, number> = {};

  // B10 (behind the upgrade): `totalReward * weight / totalWeight` with no rounding produced
  // balances such as `0.0000001234…` — unrepresentable in atoms and un-transferable (M04-4).
  // Behind the upgrade, every reward and referral cut is floored in atoms; any remainder from
  // the weighted split goes to the highest-weighted active validator, deterministically.
  if (consensusUpgrade1Active(config, inclusionBlockHeight(state))) {
    const totalRewardAtoms = Math.round(totalReward * PPL_SCALE);
    const rawRewardAtoms: Record<string, number> = {};
    let allocatedAtoms = 0;
    let topAddress: string | undefined;
    let topWeight = -1;
    for (const validator of active) {
      const weight = weights[validator.address] ?? 0;
      const amount = Math.floor((totalRewardAtoms * weight) / totalWeight);
      rawRewardAtoms[validator.address] = amount;
      allocatedAtoms += amount;
      if (weight > topWeight) {
        topWeight = weight;
        topAddress = validator.address;
      }
    }
    const leftoverAtoms = totalRewardAtoms - allocatedAtoms;
    if (leftoverAtoms > 0 && topAddress) {
      rawRewardAtoms[topAddress] = (rawRewardAtoms[topAddress] ?? 0) + leftoverAtoms;
    }

    const rewardAtoms: Record<string, number> = { ...rawRewardAtoms };
    for (const validator of active) {
      const referrer = validator.referredBy;
      if (!referrer || share <= 0) {
        continue;
      }
      const referrerState = state.validators[referrer];
      if (!referrerState || referrerState.status !== "active") {
        continue;
      }
      const cutAtoms = Math.floor((rawRewardAtoms[validator.address] ?? 0) * share);
      if (cutAtoms <= 0) {
        continue;
      }
      rewardAtoms[validator.address] = (rewardAtoms[validator.address] ?? 0) - cutAtoms;
      rewardAtoms[referrer] = (rewardAtoms[referrer] ?? 0) + cutAtoms;
      referralPayouts[referrer] = (referralPayouts[referrer] ?? 0) + cutAtoms / PPL_SCALE;
    }

    rewards = {};
    for (const [address, atoms] of Object.entries(rewardAtoms)) {
      rewards[address] = atoms / PPL_SCALE;
    }
  } else {
    const rawRewards: Record<string, number> = {};
    for (const validator of active) {
      rawRewards[validator.address] = (totalReward * (weights[validator.address] ?? 0)) / totalWeight;
    }

    rewards = { ...rawRewards };
    for (const validator of active) {
      const referrer = validator.referredBy;
      if (!referrer || share <= 0) {
        continue;
      }
      const referrerState = state.validators[referrer];
      if (!referrerState || referrerState.status !== "active") {
        continue;
      }
      const cut = (rawRewards[validator.address] ?? 0) * share;
      if (cut <= 0) {
        continue;
      }
      rewards[validator.address] = (rewards[validator.address] ?? 0) - cut;
      rewards[referrer] = (rewards[referrer] ?? 0) + cut;
      referralPayouts[referrer] = (referralPayouts[referrer] ?? 0) + cut;
    }
  }

  for (const [address, amount] of Object.entries(rewards)) {
    const acct = ensureAccount(state, address);
    acct.balance += amount;
    acct.balances[NATIVE_ASSET_ID] = acct.balance;
  }

  return {
    epoch: state.epoch,
    totalReward,
    rewards,
    referralPayouts,
    protocolIssuance,
    feeReward: validatorFeeReward,
    feeDistribution: feeDetails
  };
}

/** Sum of amounts actually credited to validators in a distribution. */
export function sumDistributedRewards(reward: RewardDistribution): number {
  return Object.values(reward.rewards).reduce((sum, amount) => sum + amount, 0);
}

export function markOfflineValidators(state: ChainState, maxIdleMs: number): void {
  const now = Date.now();
  for (const validator of Object.values(state.validators)) {
    if (validator.status !== "active") {
      continue;
    }
    if (now - validator.lastSeen > maxIdleMs) {
      validator.status = "inactive";
      validator.uptimeScore = Math.max(0.1, validator.uptimeScore - 0.2);
    }
  }
}

export function slashValidator(
  state: ChainState,
  address: string,
  fraction: number,
  reporter?: string,
  config: NetworkConfig = DEFAULT_CONFIG
): void {
  applySlash(state, config, address, fraction, state.epoch + SLASH_JAIL_EPOCHS, reporter);
}

export function countOutgoingTransactions(state: ChainState, address: string): number {
  let count = 0;
  for (const block of state.chain) {
    for (const tx of block.transactions) {
      if (tx.from === address) {
        count += 1;
      }
    }
  }
  return count;
}

export function countIncomingTransactions(state: ChainState, address: string): number {
  let count = 0;
  for (const block of state.chain) {
    for (const tx of block.transactions) {
      if (tx.to === address) {
        count += 1;
      }
    }
  }
  return count;
}

export function countTotalTransactions(state: ChainState): number {
  let count = 0;
  for (const block of state.chain) {
    count += block.transactions.length;
  }
  return count;
}

/**
 * Best-effort estimate for migration when reward history is missing.
 * Only counts epoch boundaries; does not prove rewards were paid to anyone.
 * Prefer summing reward history payouts when available.
 */
export function estimateTotalValidatorRewards(state: ChainState, config: NetworkConfig): number {
  let total = 0;
  for (const block of state.chain) {
    if (block.header.height > 0 && block.header.height % 10 === 0) {
      total += config.epochBaseIssuance;
    }
  }
  return total;
}

export function computeTotalSupply(state: ChainState): number {
  return Object.values(state.accounts).reduce((sum, account) => sum + account.balance, 0);
}

export function computeTotalStake(state: ChainState): number {
  return Object.values(state.validators)
    .filter((validator) => validator.status === "active")
    .reduce((sum, validator) => sum + validator.stake, 0);
}

export function computeReferenceTokenPriceUsd(
  state: ChainState,
  config: NetworkConfig,
  envFallback: number
): number {
  const supply = computeTotalSupply(state);
  const stake = computeTotalStake(state);
  if (supply <= 0 || stake <= 0) {
    return envFallback;
  }
  const txCount = countTotalTransactions(state);
  const activityFactor = Math.min(1, txCount / 500);
  const reference = (stake / supply) * 0.01 * (1 + activityFactor);
  if (!Number.isFinite(reference) || reference <= 0) {
    return envFallback;
  }
  return reference;
}

export async function validateAndReplayChain(
  chain: Block[],
  config: NetworkConfig
): Promise<ChainState | null> {
  if (chain.length === 0 || chain[0].header.height !== 0) {
    return null;
  }
  const state = createInitialState(config);
  if (chain[0].hash !== state.chain[0]!.hash) {
    return null;
  }
  for (let i = 1; i < chain.length; i++) {
    if (!(await tryApplyRemoteBlock(state, chain[i]!, config))) {
      return null;
    }
  }
  return state;
}

export function syncAccountNonce(state: ChainState, address: string): number {
  const nonce = countOutgoingTransactions(state, address);
  if (state.accounts[address]) {
    state.accounts[address].nonce = nonce;
  }
  return nonce;
}

export function fundValidatorJoin(
  state: ChainState,
  nodeKind: "full" | "light",
  stake: number,
  config: NetworkConfig = DEFAULT_CONFIG,
  referrer?: string
): { address: string; joinTx: Transaction; key: ReturnType<typeof generateKeyPair> } {
  const key = generateKeyPair();
  const faucetNonce = ensureAccount(state, FAUCET_ADDRESS).nonce;
  const fundTx = signTransaction(DEV_FAUCET_PRIVATE_KEY, {
    id: `fund-${key.address}`,
    from: FAUCET_ADDRESS,
    to: key.address,
    amount: stake + 50,
    fee: 0,
    nonce: faucetNonce,
    timestamp: Date.now(),
    type: "transfer"
  });
  applyTransaction(state, fundTx, config);

  const joinTx = signTransaction(key.privateKey, {
    id: `join-${key.address}`,
    from: key.address,
    to: "staking_pool",
    amount: stake,
    fee: 1,
    nonce: 0,
    timestamp: Date.now(),
    type: "joinValidator",
    payload: { nodeKind, ...(referrer ? { referrer } : {}) }
  });
  return { address: key.address, joinTx, key };
}

export * from "./crypto.js";
export * from "./storage.js";
export * from "./keystore.js";
export * from "./curve.js";

export * from "./security-upgrade.js";
export * from "./ppl-units.js";
export * from "./address-policy.js";
export * from "./evm-json-rpc.js";
