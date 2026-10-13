export type NodeKind = "full" | "light";
export type ValidatorStatus = "joining" | "active" | "inactive" | "slashed" | "unbonding";
export type TxType =
  | "transfer"
  | "joinValidator"
  | "leaveValidator"
  | "unstake"
  | "attestation"
  | "slashEvidence"
  | "proposal"
  | "vote"
  | "tokenCreate"
  | "curveBuy"
  | "curveSell"
  | "creatorClaim"
  | "nftMint"
  | "nftTransfer"
  | "contractDeploy"
  | "contractCall"
  | "registerParticipant"
  | "participantReferral"
  | "growthClaim"
  | "ammCreatePool"
  | "ammAddLiquidity"
  | "ammRemoveLiquidity"
  | "ammSwap";

export type AssetType = "native" | "fungible" | "user" | "pool";
export type AssetStatus = "active" | "paused" | "deprecated";

export interface TokenAllocation {
  bondingCurve: number;
  communityPool: number;
  creator: number;
  liquidityReserve: number;
  ecosystemReserve: number;
}

export interface CreatorVestingState {
  assetId: string;
  creator: string;
  totalAllocation: number;
  upfrontUnlocked: number;
  vestedAmount: number;
  claimedAmount: number;
  startBlock: number;
  durationBlocks: number;
}

export type CurveStatus = "active" | "migrated";

export { transactionIdPayload } from "./transaction-id.js";

export interface CurveState {
  /** Native calculations and invariantK use micro-PPL; reserve fields/API remain PPL. */
  nativeScale?: number;
  assetId: string;
  initialCurveAllocation: number;
  currentTokenReserve: number;
  virtualTokenReserve: number;
  virtualNativeReserve: number;
  actualNativeReserve: number;
  invariantK: string;
  initialPriceReference: number;
  status: CurveStatus;
  migrationThreshold: number;
  migratedAt?: number;
  liquidityPoolId?: string;
}

export type PoolStatus = "active" | "locked";

export interface LiquidityPoolState {
  /** PPL fields remain PPL; AMM calculations convert to these atomic units. */
  nativeScale?: number;
  poolId: string;
  tokenAssetId: string;
  nativeAssetId: string;
  tokenReserve: number;
  nativeReserve: number;
  feeBps: number;
  status: PoolStatus;
  locked: boolean;
  createdAt: number;
  /**
   * Outstanding LP shares. Omitted on historical curve-migrated pools until the
   * first add/remove. Must not be injected at load time (stateRoot compatibility).
   */
  totalLpSupply?: number;
  /** Shares that cannot be burned (MINIMUM_LIQUIDITY and/or protocol-migrated bootstrap). */
  lockedLpSupply?: number;
  /** Address → LP shares. Omitted until a user is minted shares. */
  lpBalances?: Record<string, number>;
}

export interface AmmCreatePoolPayload {
  tokenAssetId: string;
  tokenAmount: number;
  nativeAmount: number;
  minLpOut?: number;
}

export interface AmmAddLiquidityPayload {
  poolId?: string;
  tokenAssetId?: string;
  tokenAmount: number;
  nativeAmount: number;
  minLpOut?: number;
}

export interface AmmRemoveLiquidityPayload {
  poolId?: string;
  tokenAssetId?: string;
  lpAmount: number;
  minTokenOut?: number;
  minNativeOut?: number;
}

export interface AmmSwapPayload {
  poolId?: string;
  tokenAssetId?: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  minAmountOut: number;
}

export interface AmmQuote {
  poolId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut: number;
  lpFee: number;
  feeBps: number;
  tokenReserve: number;
  nativeReserve: number;
}

export interface TokenCreatePayload {
  assetId?: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: number;
  metadata?: Record<string, unknown>;
}

export interface CurveBuyPayload {
  assetId: string;
  nativeAmount?: number;
  nativeIn?: number;
  minTokensOut?: number;
}

export interface CurveSellPayload {
  assetId: string;
  tokenAmount?: number;
  tokensIn?: number;
  minNativeOut?: number;
}

export interface CreatorClaimPayload {
  assetId: string;
}

export interface NftRecord {
  nftId: string;
  owner: string;
  creator: string;
  name: string;
  description: string;
  imageUri: string;
  collectionId?: string;
  createdAt: number;
}

export interface NftMintPayload {
  nftId?: string;
  name: string;
  description?: string;
  imageUri: string;
  collectionId?: string;
}

export interface NftTransferPayload {
  nftId: string;
}

export interface ContractAccount {
  code: string;
  storage: Record<string, string>;
  nonce: number;
  creator: string;
}

export interface ContractLog {
  address: string;
  topics: string[];
  data: string;
}

export interface ContractReceipt {
  txId: string;
  contractAddress?: string;
  gasUsed: number;
  status: 0 | 1;
  logs: ContractLog[];
  returnData: string;
  error?: string;
}

export interface ContractDeployPayload {
  bytecode: string;
  gasLimit: number;
  constructorArgs?: string;
  /** Submitted source for explorer verification. Not hashed in stateRoot. */
  source?: Record<string, unknown>;
}

export interface ContractCallPayload {
  data: string;
  gasLimit: number;
}

/** Full claim of one Growth allocation. `epoch` is the settlement epoch, not a block height. */
export interface GrowthClaimPayload {
  epoch: number;
  referred: string;
  level: 1 | 2;
}

export interface AssetMetadata {
  assetId: string;
  type: AssetType;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: number;
  creator: string;
  creationMetadata?: Record<string, unknown>;
  status: AssetStatus;
  createdAt?: number;
  allocation?: TokenAllocation;
}

export interface Transaction {
  /** Signed replay-protection domain. Required on the wire. */
  chainId?: string;
  id: string;
  from: string;
  to: string;
  amount: number;
  fee: number;
  nonce: number;
  timestamp: number;
  type: TxType;
  /** Explicit asset identifier. Defaults to native asset ("ppl") if omitted. */
  assetId?: string;
  payload?: Record<string, unknown>;
  publicKey?: string;
  signature?: string;
}

export interface WireMessage {
  type:
    | "hello"
    | "tx"
    | "block"
    | "request_blocks"
    | "blocks_response"
    | "inv"
    | "getdata"
    | "peers";
  peerId: string;
  payload: unknown;
}

export interface BlockHeader {
  chainId?: string;
  protocolVersion?: number;
  height: number;
  previousHash: string;
  stateRoot: string;
  proposer: string;
  timestamp: number;
}

export interface Block {
  publicKey?: string;
  signature?: string;
  header: BlockHeader;
  transactions: Transaction[];
  hash: string;
}

export interface Validator {
  address: string;
  nodeKind: NodeKind;
  status: ValidatorStatus;
  stake: number;
  uptimeScore: number;
  attestationScore: number;
  lastSeen: number;
  joinedAtEpoch: number;
  jailUntilEpoch?: number;
  unbondingEpoch?: number;
  proposedMisses?: number;
  /** Address of the validator that referred this one at join time. */
  referredBy?: string;
}

/**
 * Consensus participant. Distinct from an account and from a validator.
 * An address is a participant only when a record exists.
 * Referral depth is derived from `parent` and is not stored.
 * `linkedAtHeight` is the block height that included the edge. It is not a
 * growth-epoch index and it does not implement maturation.
 */
export interface ParticipantState {
  address: string;
  /** Sole parent in the participant referral forest. Absent for a root. */
  parent?: string;
  /**
   * Block height that included this edge. Set once with `parent`.
   * Absent for a root. Immutable. Not a growth epoch.
   */
  linkedAtHeight?: number;
  /**
   * Block height that included registration. Absent on records created
   * before this field existed. Age fails closed when it is absent.
   */
  registeredAtHeight?: number;
  /**
   * M13-2 (owner decision): proof that this address belongs to a verified human.
   * Growth L1/L2 rewards are payable only to referrals of verified participants.
   * TODO(M13-2): no transaction writes this field yet — on-chain verification
   * (Telegram or Human Passport, as on the website) does not exist, so the field
   * is always absent and Growth L1/L2 payouts stay off. Adding the write path is
   * a separate task; `method` must stay in `GROWTH_IDENTITY_METHODS`.
   */
  identityVerified?: {
    method: string;
    verifiedAtHeight: number;
  };
}

export interface FeeSplitConfig {
  validatorShare: number;
  communityShare: number;
  treasuryShare: number;
  liquidityShare: number;
  burnShare: number;
}

export interface FeeSplitResult {
  validatorAmount: number;
  communityAmount: number;
  treasuryAmount: number;
  liquidityAmount: number;
  burnAmount: number;
  /** Model A growth share. Absent on the five-bucket FeeSplitter path. */
  growthAmount?: number;
  total: number;
}

export interface FeeDistributionDetails {
  totalCollectedFees: number;
  validatorFees: number;
  communityPoolFees: number;
  treasuryFees: number;
  liquidityFees: number;
  burnedFees: number;
}

export interface AssetPoolAccounting {
  assetId: string;
  totalAllocated: number;
  totalDistributed: number;
  remainingBalance: number;
}

export interface CommunityPoolState {
  pools: Record<string, AssetPoolAccounting>;
}

export interface RewardDistribution {
  epoch: number;
  totalReward: number;
  rewards: Record<string, number>;
  /** Amount credited to referrers from referralShare cuts this epoch. */
  referralPayouts?: Record<string, number>;
  /** Portion of reward from protocol security emission. */
  protocolIssuance?: number;
  /** Portion of reward from network transaction fees. */
  feeReward?: number;
  /** Detailed breakdown of network fees distributed this epoch. */
  feeDistribution?: FeeDistributionDetails;
}

export interface NetworkConfig {
  /** Coordinated security fork; omitted on legacy networks. Not part of genesis identity. */
  securityUpgrade?: { height: number; validatorAllowlist: string[] };
  /** Coordinated consensus fork #1 (owner-approved small items); omitted on legacy networks. Not part of genesis identity. */
  consensusUpgrade1?: { height: number };
  /** Pinned bootstrap authority before the validator set becomes active. */
  bootstrapAddress?: string;
  chainId: string;
  minStake: number;
  warmupEpochs: number;
  unbondingEpochs: number;
  lightValidatorWeightMultiplier: number;
  epochBaseIssuance: number;
  attestationFinalityThreshold: number;
  /** Fraction of a referred validator's epoch reward paid to their referrer (0–0.2). */
  referralShare: number;
  /** Configurable transaction fee distribution across protocol destinations. */
  feeSplit?: FeeSplitConfig;
}

export interface ChainSnapshot {
  head: BlockHeader;
  validators: Validator[];
  finalizedHeight: number;
  peerCount?: number;
  mempoolSize?: number;
}

export interface GovernanceProposal {
  id: string;
  proposer: string;
  createdEpoch: number;
  status: "open" | "passed" | "rejected";
  params: Partial<Pick<NetworkConfig, "minStake" | "epochBaseIssuance" | "lightValidatorWeightMultiplier">>;
  votesFor: number;
  votesAgainst: number;
  voters: string[];
}

export interface SlashEvidence {
  blockA?: Block;
  blockB?: Block;
  type: "double_sign" | "conflicting_attestation";
  validator: string;
  height: number;
  blockHashA: string;
  blockHashB: string;
  /** Address that submitted the evidence; receives a share of the slashed stake. */
  reporter?: string;
}

export interface HealthResponse {
  ok: boolean;
  chainId: string;
  peerId: string;
}

export interface HealthDetailsResponse extends HealthResponse {
  height: number;
  finalizedHeight: number;
  finalizedLag: number;
  peerCount: number;
  mempoolSize: number;
  epoch: number;
}

export interface MetricsResponse {
  ok: boolean;
  peerId: string;
  chainId: string;
  height: number;
  epoch: number;
  finalizedHeight: number;
  finalizedLag: number;
  validators: number;
  activeValidators: number;
  mempoolSize: number;
  peerCount: number;
  feePool: number;
  transactionCount: number;
  totalValidatorRewards: number;
  tokenPriceUsd: number;
  referenceTokenPriceUsd: number;
  rejectedTxCount: number;
  apiRequestCount?: number;
  apiLatencyP95Ms?: number;
  wsClientCount?: number;
  wsDroppedClients?: number;
  stateRevision?: number;
  maxThroughputTps?: number;
  blockIntervalMs?: number;
  maxTxPerBlock?: number;
  missedProposalCount?: number;
  attestationQuorumHeights?: number;
  outboundPeerCount?: number;
  reconnectCount?: number;
  bannedPeerCount?: number;
  suggestedTransferFee?: number;
  chainWindowBlocks?: number;
  prunedBeforeHeight?: number;
}

export interface SearchResponse {
  blocks: Block[];
  transactions: Array<Transaction & { blockHeight: number; blockHash: string }>;
  addresses: string[];
  contracts?: string[];
}

export {
  BATCH_FEE_BASE_PPL,
  BATCH_FEE_CAP_PPL,
  BATCH_FEE_PER_EXTRA_PPL,
  DEFAULT_NFT_MINT_MIN_FEE,
  DEFAULT_TOKEN_CREATE_MIN_FEE,
  DEFAULT_TRANSFER_FEE_PPL,
  FEE_QUOTE_PPL_PRICE_USD,
  FEE_QUOTE_SOL_USD,
  PROPOSED_TRANSFER_FEE_PPL,
  SOLANA_BASE_FEE_LAMPORTS,
  SOLANA_BASE_FEE_SOL,
  SOLANA_LAMPORTS_PER_SOL,
  SOLANA_METAPLEX_CORE_NFT_SOL,
  SOLANA_SPL_MINT_RENT_SOL,
  SOLANA_TOKEN_METADATA_NFT_SOL,
  solToPpl
} from "./factory-fees.js";
export {
  APPROVED_CONTRACT_GAS_PRICE_PPL,
  DEFAULT_BLOCK_GAS_LIMIT,
  DEFAULT_TX_GAS_LIMIT,
  MAX_TX_GAS_LIMIT,
  TYPICAL_CONTRACT_DEPLOY_FEE_PPL,
  TYPICAL_CONTRACT_DEPLOY_GAS,
  quoteContractGasFeePpl
} from "./contract-gas.js";
export {
  EIP155_CHAIN_ID,
  EVM_ADDRESS_ACTIVATION_HEIGHT,
  EVM_NATIVE_DECIMALS_RPC
} from "./evm-compat.js";
