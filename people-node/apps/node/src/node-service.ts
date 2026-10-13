import { EventEmitter } from "node:events";
import {
  chooseFork,
  chooseForkWithCheckpoint,
  computeReferenceTokenPriceUsd,
  countTotalTransactions,
  computeMaxThroughputTps,
  countAttestationQuorumHeights,
  MAX_TRANSACTIONS_PER_BLOCK,
  DEFAULT_BLOCK_INTERVAL_MS,
  BATCH_FEE_BASE,
  DEFAULT_CONFIG,
  DEFAULT_TRANSFER_FEE,
  SLASH_FRACTION,
  suggestedTransferFee,
  trimChainWindow,
  CHAIN_WINDOW_BLOCKS,
  ChainStore,
  buildBlock,
  createInitialState,
  computeStateRoot,
  keyPairFromPrivateKey,
  distributeEpochRewards,
  sumDistributedRewards,
  enqueueTransaction,
  txFeeUsesLiveModelA,
  markOfflineValidators,
  normalizeAttestationVotes,
  noteSeenBlock,
  recordMissedProposal,
  selectProposer,
  slashValidator,
  tryApplyRemoteBlock,
  signTransaction,
  verifySlashEvidence,
  verifyTransaction,
  validateMempoolSpending,
  securityUpgradeActive,
  tokenCreateMinFee,
  nftMintMinFee,
  FAUCET_ADDRESS,
  DEV_FAUCET_PRIVATE_KEY,
  getAsset,
  listAssets,
  getAllBalances,
  getAccountBalance,
  getCommunityPoolAccounting,
  calculateVestedAmount,
  getNft,
  listNfts,
  listOwnedNfts,
  getContract,
  listContracts,
  staticContractCall,
  lookupAddressMetadata,
  resolveAccountStorageKey,
  legacyAddressFromPublicKey,
  quoteContractFeePpl,
  contractGasPricePpl,
  contractBlockGasLimit,
  DEFAULT_TX_GAS_LIMIT,
  TYPICAL_CONTRACT_DEPLOY_GAS,
  NATIVE_ASSET_ID,
  listLiquidityPools,
  quoteAmmSwap,
  type ChainState
} from "@ovn/core";
import { GossipNetwork } from "@ovn/p2p";
import type {
  Block,
  HealthDetailsResponse,
  MetricsResponse,
  RewardDistribution,
  SlashEvidence,
  Transaction
} from "@ovn/protocol";

/** Relay-only cap: how many fee-less (non-onboarding) relayed txs the mempool may hold. */
const MAX_PENDING_FREE_TXS = Math.max(0, Number(process.env.PUBLIC_MEMPOOL_FREE_TX_CAP ?? 500));

export type LiveEvent =
  | { type: "snapshot"; payload: ReturnType<NodeService["getSnapshot"]> }
  | { type: "metrics"; payload: ReturnType<NodeService["getMetrics"]> }
  | { type: "feed"; payload: ReturnType<NodeService["getLiveFeed"]> }
  | { type: "block"; payload: Block }
  | { type: "rewards"; payload: RewardDistribution | null }
  | { type: "tx"; payload: Transaction }
  | { type: "slash_candidate"; payload: SlashEvidence };

export interface NodeServiceOptions {
  dataDir: string;
  peerId: string;
  gossipPort: number;
  bootstrapPeers: string[];
  /** Public gossip URL for peer-exchange (env PUBLIC_GOSSIP_URL). */
  advertiseAddress?: string;
  blockIntervalMs?: number;
}

type IndexedTx = Transaction & { blockHeight: number; blockHash: string };

export class NodeService {
  readonly config = { ...DEFAULT_CONFIG };
  chainState: ChainState;
  feePool = 0;
  latestReward: RewardDistribution | null = null;
  totalValidatorRewards = 0;
  totalTransactions = 0;
  rewardHistory: RewardDistribution[] = [];
  private readonly live = new EventEmitter();
  private readonly store: ChainStore;
  private readonly gossip: GossipNetwork;
  private readonly txRateMap = new Map<string, { count: number; windowStart: number }>();
  private readonly faucetRateMap = new Map<string, { count: number; windowStart: number }>();
  /** RA-CHAIN-N1: aggregate payout tracked per UTC day, mirroring the EVM faucet's `dailyCapPpl`. */
  private faucetPayoutDay = -1;
  private faucetPayoutAmount = 0;
  private readonly contractCallRateMap = new Map<string, { count: number; windowStart: number }>();
  private readonly contractCallMaxGas = Math.max(
    1,
    Math.floor(Number(process.env.CONTRACT_CALL_MAX_GAS ?? 1_000_000))
  );
  private readonly contractCallRateLimitPerMinute = Math.max(
    1,
    Math.floor(Number(process.env.CONTRACT_CALL_RATE_LIMIT_PER_MIN ?? 30))
  );
  private rejectedTxCount = 0;
  private apiRequestCount = 0;
  private apiLatencySamples: number[] = [];
  private wsDroppedClients = 0;
  private persistTimer: NodeJS.Timeout | null = null;
  private persistInFlight = false;
  private persistQueued = false;
  private txById = new Map<string, IndexedTx>();
  private txOrder: IndexedTx[] = [];
  private txByAddress = new Map<string, string[]>();
  private txCountsByAddress = new Map<string, { in: number; out: number }>();
  private blockOrderNewest: Block[] = [];
  private blockByHeight = new Map<number, Block>();
  private blockByHash = new Map<string, Block>();
  private blockTimer: NodeJS.Timeout | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private readonly localValidatorAddress = process.env.VALIDATOR_ADDRESS ?? "";
  private readonly localValidatorPrivateKey = process.env.VALIDATOR_PRIVATE_KEY ?? "";
  private readonly enableDevEndpoints =
    process.env.NODE_ENV !== "production" || process.env.ALLOW_DEV_ENDPOINTS === "1";
  private readonly apiToken = process.env.DEV_API_TOKEN ?? "";
  private readonly tokenPriceUsdEnv = Number(process.env.PPL_PRICE_USD ?? process.env.VLS_PRICE_USD ?? "0.12");
  private pendingHeightSince = 0;
  private pendingExpectedHeight = 0;
  private lastAutoAttestedHeight = 0;
  private latestSlashCandidate: SlashEvidence | null = null;
  private submittedSlashKeys = new Set<string>();
  private prunedBeforeHeight = 0;
  /** Highest block height this node has signed into a block (M10-3 equivocation guard). */
  private lastSignedHeight = 0;
  private readonly archiveMode = process.env.ARCHIVE_MODE === "1";
  private readonly pendingSince = new Map<string, number>();
  private readonly mempoolTtlMs = 10 * 60_000;

  constructor(private readonly options: NodeServiceOptions) {
    if (process.env.CHAIN_ID) {
      this.config.chainId = process.env.CHAIN_ID;
    }
    this.chainState = createInitialState(this.config);
    this.store = new ChainStore(`${options.dataDir}/chain.db`, this.archiveMode);
    this.gossip = new GossipNetwork({
      peerId: options.peerId,
      chainId: this.config.chainId,
      port: options.gossipPort,
      bootstrapPeers: options.bootstrapPeers,
      advertiseAddress: options.advertiseAddress,
      peerBookPath: `${options.dataDir}/peers.json`
    });
  }

  onLive(listener: (event: LiveEvent) => void): () => void {
    this.live.on("event", listener);
    return () => {
      this.live.off("event", listener);
    };
  }

  publishLiveState(block?: Block, includeFeed = false): void {
    if (includeFeed || block) {
      this.live.emit("event", { type: "snapshot", payload: this.getSnapshot() } satisfies LiveEvent);
    }
    this.live.emit("event", { type: "metrics", payload: this.getMetrics() } satisfies LiveEvent);
    if (includeFeed) {
      this.live.emit("event", { type: "feed", payload: this.getLiveFeed() } satisfies LiveEvent);
    }
    if (block) {
      this.live.emit("event", { type: "block", payload: block } satisfies LiveEvent);
      if (this.latestReward) {
        this.live.emit("event", { type: "rewards", payload: this.latestReward } satisfies LiveEvent);
      }
    }
  }

  getLiveFeed() {
    return {
      accounts: this.listAccounts(100),
      blocks: this.getRecentBlocks(10),
      transactions: this.getRecentTransactions(50),
      proposals: this.listProposals()
    };
  }

  async start(): Promise<void> {
    await this.store.open();
    const persisted = await this.store.load();
    if (persisted) {
      const saved = persisted.chainState;
      // M10-5: a joining node derives bootstrapAddress from the genesis/chain state it is
      // loading, not from its own env — env only has to agree when the operator sets it.
      const savedBootstrap = (saved.networkConfig?.bootstrapAddress ?? "").trim();
      const envBootstrap = (process.env.BOOTSTRAP_ADDRESS ?? "").trim();
      if (envBootstrap && savedBootstrap && envBootstrap.toLowerCase() !== savedBootstrap.toLowerCase()) {
        await this.store.close();
        throw new Error("BOOTSTRAP_ADDRESS does not match the chain's genesis bootstrap address; existing data preserved");
      }
      this.config.bootstrapAddress = savedBootstrap || envBootstrap;
      if (saved.chain.at(-1)?.header.protocolVersion !== 2 || saved.networkConfig?.chainId !== this.config.chainId || !/^0x[0-9a-f]{40}$/.test(this.config.bootstrapAddress)) {
        await this.store.close();
        throw new Error("Incompatible chain snapshot; explicit reviewed migration required. Existing data preserved.");
      }
      const savedHead = saved.chain.at(-1)!;
      if (savedHead.header.height > 0 && computeStateRoot(saved) !== savedHead.header.stateRoot) {
        await this.store.close();
        throw new Error("Snapshot state root mismatch; existing data preserved");
      }
      this.chainState = persisted.chainState;
      this.feePool = this.chainState.pendingValidatorFees ?? 0;
      const configuredUpgrade = this.config.securityUpgrade;
      const storedUpgrade = saved.networkConfig?.securityUpgrade;
      if (storedUpgrade && JSON.stringify(storedUpgrade) !== JSON.stringify(configuredUpgrade)) {
        await this.store.close();
        throw new Error("Security upgrade configuration changed; existing data preserved");
      }
      if (configuredUpgrade && !storedUpgrade && savedHead.header.height >= configuredUpgrade.height) {
        await this.store.close();
        throw new Error("Security upgrade must be scheduled above the existing head");
      }
      // CHAIN-H2: Consensus Upgrade #1 is a coordinated fork with the same failure modes, so it
      // gets the same two rails. Without them a persisted height silently survives an env change
      // (Object.assign below cannot delete it) and a height at or below the head activates
      // retroactively — both fork this node away from its peers.
      const configuredUpgrade1 = this.config.consensusUpgrade1;
      const storedUpgrade1 = saved.networkConfig?.consensusUpgrade1;
      if (storedUpgrade1 && JSON.stringify(storedUpgrade1) !== JSON.stringify(configuredUpgrade1)) {
        await this.store.close();
        throw new Error("Consensus upgrade 1 configuration changed; existing data preserved");
      }
      if (configuredUpgrade1 && !storedUpgrade1 && savedHead.header.height >= configuredUpgrade1.height) {
        await this.store.close();
        throw new Error("Consensus upgrade 1 must be scheduled above the existing head");
      }
      if (configuredUpgrade && Object.values(saved.validators).some(validator => validator.status === "active" && !configuredUpgrade.validatorAllowlist.includes(validator.address))) {
        await this.store.close();
        throw new Error("Existing active validator is missing from the approved allowlist");
      }
      if (this.chainState.networkConfig) Object.assign(this.config, this.chainState.networkConfig);
      if (configuredUpgrade) this.config.securityUpgrade = configuredUpgrade;
      if (configuredUpgrade1) this.config.consensusUpgrade1 = configuredUpgrade1;
      this.chainState.networkConfig = structuredClone(this.config);
      this.latestReward = persisted.latestReward;
      this.totalValidatorRewards = persisted.totalValidatorRewards ?? 0;
      this.totalTransactions = persisted.totalTransactions ?? 0;
      this.rewardHistory = persisted.rewardHistory ?? [];
      this.sanitizeRewardTotals();
      this.backfillCounters();
      normalizeAttestationVotes(this.chainState);
      const trimmed = trimChainWindow(this.chainState, CHAIN_WINDOW_BLOCKS);
      this.prunedBeforeHeight = Math.max(this.prunedBeforeHeight, trimmed.prunedBefore);
    } else if (!/^0x[0-9a-f]{40}$/.test(this.config.bootstrapAddress ?? "")) {
      // No existing chain state to inherit bootstrapAddress from: this node is creating a
      // brand-new genesis, so it alone fixes the canonical address for the network.
      await this.store.close();
      throw new Error("BOOTSTRAP_ADDRESS is required to create a new genesis");
    }
    const bootstrapKey = process.env.BOOTSTRAP_PRIVATE_KEY;
    if (bootstrapKey) {
      const derived = keyPairFromPrivateKey(bootstrapKey);
      const bootstrap = (this.config.bootstrapAddress ?? "").toLowerCase();
      const legacy = legacyAddressFromPublicKey(derived.publicKey).toLowerCase();
      if (derived.address !== bootstrap && legacy !== bootstrap) {
        await this.store.close();
        throw new Error("Bootstrap key does not match BOOTSTRAP_ADDRESS");
      }
    }
    if (this.localValidatorPrivateKey) {
      const derived = keyPairFromPrivateKey(this.localValidatorPrivateKey);
      const expected = (this.localValidatorAddress ?? "").toLowerCase();
      const legacy = legacyAddressFromPublicKey(derived.publicKey).toLowerCase();
      if (derived.address !== expected && legacy !== expected) {
        await this.store.close();
        throw new Error("Validator key does not match VALIDATOR_ADDRESS");
      }
    }
    this.rebuildTransactionIndexes();
    if (this.archiveMode) {
      try {
        if (!persisted) await this.store.archiveBlock(this.chainState.chain[0]!);
        await this.store.assertArchiveComplete(this.chainState.chain.at(-1)!);
      } catch (error) { await this.store.close(); throw error; }
    }
    if (process.env.EXPECTED_GENESIS_HASH && process.env.EXPECTED_GENESIS_HASH !== this.chainState.chain[0]!.hash) {
      await this.store.close();
      throw new Error("Network genesis mismatch; existing data preserved");
    }

    await this.recoverSignedBlocks();

    await this.gossip.start();
    this.gossip.on("tx", (tx) => this.handleRemoteTx(tx));
    this.gossip.on("block", (block) => this.handleRemoteBlock(block));
    this.gossip.on("request_blocks", (fromHeight, toHeight, peerId) => {
      void this.serialize(async () => {
        this.gossip.sendBlocks(await this.getSyncBlocks(fromHeight, toHeight), peerId);
      }).catch(() => { this.rejectedTxCount += 1; });
    });
    this.gossip.on("blocks_response", (blocks) => {
      void this.serialize(() => this.handleBlocksResponse(blocks)).catch(() => { this.rejectedTxCount += 1; });
    });

    this.blockTimer = setInterval(() => this.tick(), this.options.blockIntervalMs ?? 3000);
    this.syncTimer = setInterval(() => this.requestCatchUp(), 8_000);
    this.requestCatchUp();
  }

  async stop(): Promise<void> {
    if (this.blockTimer) {
      clearInterval(this.blockTimer);
    }
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    await this.transition;
    await this.flushPersist();
    await this.gossip.close();
    await this.store.close();
  }

  isDevEndpointAllowed(token?: string): boolean {
    if (this.enableDevEndpoints && !this.apiToken) {
      return true;
    }
    if (!this.apiToken) {
      return false;
    }
    return token === this.apiToken;
  }

  /** Testnet faucet. Disabled on mainnet. In production requires ALLOW_FAUCET=1. */
  isPublicFaucetEnabled(): boolean {
    if (!DEV_FAUCET_PRIVATE_KEY) return false;
    const chainId = (this.config.chainId ?? "").toLowerCase();
    if (chainId.includes("mainnet") || chainId.includes("main-net")) {
      return false;
    }
    if (process.env.ALLOW_FAUCET === "1") {
      return true;
    }
    return process.env.NODE_ENV !== "production";
  }

  faucetMaxAmount(): number {
    const raw = Number(process.env.FAUCET_MAX_AMOUNT ?? 20);
    return Number.isFinite(raw) && raw > 0 ? raw : 20;
  }

  /**
   * RA-CHAIN-N1: without this, `allowFaucet`'s per-address window and `faucetMaxAmount`'s
   * per-tx cap do not stop an attacker who mints a fresh address per request — the mempool-busy
   * guard serializes throughput but does not bound it, so the whole `FAUCET_ADDRESS` balance is
   * drainable over time. `null` disables the budget (tests / non-production).
   */
  faucetDailyCapAmount(): number | null {
    const raw = process.env.FAUCET_DAILY_CAP_PPL;
    if (raw === "0") return null;
    const n = Number(raw ?? 10_000);
    return Number.isFinite(n) && n > 0 ? n : 10_000;
  }

  getHead(): Block["header"] {
    return this.chainState.chain[this.chainState.chain.length - 1]!.header;
  }

  getSnapshot() {
    return {
      head: this.getHead(),
      validators: Object.values(this.chainState.validators),
      finalizedHeight: this.chainState.finalizedHeight || Math.max(0, this.chainState.chain.at(-3)?.header.height ?? 0),
      peerCount: this.gossip.peerCount(),
      mempoolSize: this.chainState.mempool.length,
      epoch: this.chainState.epoch
    };
  }

  getMetrics(): MetricsResponse {
    const head = this.getHead();
    const finalizedHeight = this.getSnapshot().finalizedHeight;
    const tokenPriceUsd = computeReferenceTokenPriceUsd(
      this.chainState,
      this.config,
      this.tokenPriceUsdEnv
    );
    const sortedLatency = [...this.apiLatencySamples].sort((a, b) => a - b);
    const p95Index = Math.max(0, Math.floor(sortedLatency.length * 0.95) - 1);
    const apiLatencyP95Ms =
      sortedLatency.length > 0 ? sortedLatency[p95Index] ?? sortedLatency[sortedLatency.length - 1]! : 0;
    const blockIntervalMs = this.options.blockIntervalMs ?? DEFAULT_BLOCK_INTERVAL_MS;
    const maxThroughputTps = computeMaxThroughputTps(MAX_TRANSACTIONS_PER_BLOCK, blockIntervalMs);
    return {
      ok: true,
      peerId: this.options.peerId,
      height: head.height,
      epoch: this.chainState.epoch,
      finalizedHeight,
      finalizedLag: Math.max(0, head.height - finalizedHeight),
      validators: Object.keys(this.chainState.validators).length,
      activeValidators: Object.values(this.chainState.validators).filter((v) => v.status === "active").length,
      mempoolSize: this.chainState.mempool.length,
      peerCount: this.gossip.peerCount(),
      feePool: this.feePool,
      chainId: this.config.chainId,
      transactionCount: this.totalTransactions,
      totalValidatorRewards: this.totalValidatorRewards,
      tokenPriceUsd,
      referenceTokenPriceUsd: tokenPriceUsd,
      rejectedTxCount: this.rejectedTxCount,
      apiRequestCount: this.apiRequestCount,
      apiLatencyP95Ms,
      wsDroppedClients: this.wsDroppedClients,
      stateRevision: this.chainState.stateRevision ?? 0,
      maxThroughputTps,
      blockIntervalMs,
      maxTxPerBlock: MAX_TRANSACTIONS_PER_BLOCK,
      missedProposalCount: this.chainState.missedProposalCount ?? 0,
      attestationQuorumHeights: countAttestationQuorumHeights(this.chainState, this.config),
      outboundPeerCount: this.gossip.outboundPeerCount(),
      reconnectCount: this.gossip.reconnectCount(),
      bannedPeerCount: this.gossip.bannedPeerCount(),
      suggestedTransferFee: suggestedTransferFee(this.chainState.mempool),
      chainWindowBlocks: this.chainState.chain.length,
      prunedBeforeHeight: this.prunedBeforeHeight
    };
  }

  getPrometheusMetrics(): string {
    const m = this.getMetrics();
    const lines = [
      `# HELP ovn_height Chain head height`,
      `# TYPE ovn_height gauge`,
      `ovn_height ${m.height}`,
      `# HELP ovn_finalized_height Finalized height`,
      `# TYPE ovn_finalized_height gauge`,
      `ovn_finalized_height ${m.finalizedHeight}`,
      `# HELP ovn_finalized_lag Head minus finalized`,
      `# TYPE ovn_finalized_lag gauge`,
      `ovn_finalized_lag ${m.finalizedLag}`,
      `# HELP ovn_validators Validator count`,
      `# TYPE ovn_validators gauge`,
      `ovn_validators ${m.validators}`,
      `# HELP ovn_active_validators Active validators`,
      `# TYPE ovn_active_validators gauge`,
      `ovn_active_validators ${m.activeValidators}`,
      `# HELP ovn_peer_count Connected peers`,
      `# TYPE ovn_peer_count gauge`,
      `ovn_peer_count ${m.peerCount}`,
      `# HELP ovn_missed_proposals Missed proposal events`,
      `# TYPE ovn_missed_proposals counter`,
      `ovn_missed_proposals ${m.missedProposalCount ?? 0}`,
      `# HELP ovn_attestation_quorum_heights Heights with attestation quorum`,
      `# TYPE ovn_attestation_quorum_heights gauge`,
      `ovn_attestation_quorum_heights ${m.attestationQuorumHeights ?? 0}`,
      `# HELP ovn_outbound_peers Outbound peer connections`,
      `# TYPE ovn_outbound_peers gauge`,
      `ovn_outbound_peers ${m.outboundPeerCount ?? 0}`,
      `# HELP ovn_reconnect_count Gossip reconnect attempts`,
      `# TYPE ovn_reconnect_count counter`,
      `ovn_reconnect_count ${m.reconnectCount ?? 0}`,
      `# HELP ovn_banned_peers Banned peer count`,
      `# TYPE ovn_banned_peers gauge`,
      `ovn_banned_peers ${m.bannedPeerCount ?? 0}`,
      `# HELP ovn_suggested_transfer_fee Recommended transfer fee in PPL`,
      `# TYPE ovn_suggested_transfer_fee gauge`,
      `ovn_suggested_transfer_fee ${m.suggestedTransferFee ?? DEFAULT_TRANSFER_FEE}`,
      `# HELP ovn_chain_window_blocks Blocks retained in memory`,
      `# TYPE ovn_chain_window_blocks gauge`,
      `ovn_chain_window_blocks ${m.chainWindowBlocks ?? 0}`,
      `# HELP ovn_pruned_before_height Heights below this may be pruned`,
      `# TYPE ovn_pruned_before_height gauge`,
      `ovn_pruned_before_height ${m.prunedBeforeHeight ?? 0}`
    ];
    return `${lines.join("\n")}\n`;
  }

  getLatestSlashCandidate(): SlashEvidence | null {
    return this.latestSlashCandidate;
  }

  recordApiRequest(durationMs: number): void {
    this.apiRequestCount += 1;
    this.apiLatencySamples.push(durationMs);
    if (this.apiLatencySamples.length > 500) {
      this.apiLatencySamples = this.apiLatencySamples.slice(-500);
    }
  }

  recordWsDroppedClient(): void {
    this.wsDroppedClients += 1;
  }

  getHealthDetails(): HealthDetailsResponse {
    const head = this.getHead();
    const finalizedHeight = this.getSnapshot().finalizedHeight;
    return {
      ok: true,
      chainId: this.config.chainId,
      peerId: this.options.peerId,
      height: head.height,
      finalizedHeight,
      finalizedLag: Math.max(0, head.height - finalizedHeight),
      peerCount: this.gossip.peerCount(),
      mempoolSize: this.chainState.mempool.length,
      epoch: this.chainState.epoch
    };
  }

  getRewardHistory(limit = 50) {
    return this.rewardHistory.slice(-Math.max(1, limit));
  }

  getRecentBlocks(limit = 10, offset = 0) {
    const max = Math.max(1, limit);
    return this.blockOrderNewest.slice(Math.max(0, offset), Math.max(0, offset) + max);
  }

  getRecentBlocksCursor(limit = 10, cursor?: number) {
    const max = Math.max(1, limit);
    let start = 0;
    if (cursor !== undefined) {
      const index = this.blockOrderNewest.findIndex((b) => b.header.height < cursor);
      const oldest = this.blockOrderNewest[this.blockOrderNewest.length - 1]?.header.height;
      if (index >= 0) {
        start = index;
      } else if (oldest !== undefined && cursor <= oldest) {
        // Cursor is below the retained window: there is nothing older to serve. Returning
        // page one instead would make a paginating client loop forever.
        return { items: [], nextCursor: null };
      }
    }
    const items = this.blockOrderNewest.slice(start).slice(0, max);
    const nextCursor = items.length === max ? items[items.length - 1]!.header.height : null;
    return { items, nextCursor };
  }

  getRecentTransactions(limit = 20, offset = 0) {
    return this.txOrder.slice(Math.max(0, offset), Math.max(0, offset) + Math.max(1, limit));
  }

  getRecentTransactionsCursor(limit = 20, cursor?: string) {
    const max = Math.max(1, limit);
    let start = 0;
    if (cursor) {
      const index = this.txOrder.findIndex((tx) => tx.id === cursor);
      if (index >= 0) {
        start = index + 1;
      }
    }
    const items = this.txOrder.slice(start, start + max);
    const nextCursor = items.length === max && items[items.length - 1] ? items[items.length - 1]!.id : null;
    return { items, nextCursor };
  }

  async getSyncBlocks(fromHeight: number, toHeight: number): Promise<Block[]> {
    if (!Number.isSafeInteger(fromHeight) || !Number.isSafeInteger(toHeight) || fromHeight < 0 || toHeight < fromHeight) return [];
    const end = Math.min(toHeight, fromHeight + 99, this.getHead().height);
    const result: Block[] = [];
    for (let height = fromHeight; height <= end; height++) {
      const block = this.getBlockByHeight(height) ?? await this.store.getBlock(height);
      if (!block) break;
      result.push(block);
    }
    return result;
  }

  getPublicNetworkInfo() {
    return {
      ...(this.config.securityUpgrade ? { securityUpgrade: this.config.securityUpgrade } : {}),
      // CHAIN-H2: joining nodes derive their env from this descriptor, so it must publish every
      // coordinated activation height, not just the security upgrade.
      ...(this.config.consensusUpgrade1 ? { consensusUpgrade1: this.config.consensusUpgrade1 } : {}),
      schemaVersion: 1, protocolVersion: 2,
      chainId: this.chainState.chain[0]!.header.chainId,
      genesisHash: this.chainState.chain[0]!.hash,
      genesisFaucetAddress: FAUCET_ADDRESS,
      bootstrapAddress: this.config.bootstrapAddress,
      bootstrapPeers: this.options.advertiseAddress ? [this.options.advertiseAddress] : [],
      archive: this.archiveMode,
      head: this.getHead().height,
      tokenCreateMinFee: tokenCreateMinFee(), nftMintMinFee: nftMintMinFee()
    };
  }

  getBlocksInRange(fromHeight: number, toHeight: number): Block[] {
    const from = Math.max(0, fromHeight);
    const to = Math.max(from, toHeight);
    return this.chainState.chain.filter(
      (block) => block.header.height >= from && block.header.height <= to
    ).slice(0, 100);
  }

  getBlockByHeight(height: number): Block | null {
    return this.blockByHeight.get(height) ?? null;
  }

  getBlockByHash(hash: string): Block | null {
    const normalized = hash.toLowerCase();
    return this.blockByHash.get(normalized) ?? null;
  }

  getBlockAttestationStats(height: number) {
    const votes = this.chainState.attestationVotes[height] ?? {};
    const validatorConfirmations = Object.keys(votes).length;
    const activeValidators = Object.values(this.chainState.validators).filter(
      (validator) => validator.status === "active"
    ).length;
    const finalizedHeight = this.getSnapshot().finalizedHeight;
    return {
      validatorConfirmations,
      activeValidators,
      finalized: height > 0 && height <= finalizedHeight
    };
  }

  getTransactionById(id: string) {
    const tx = this.txById.get(id.toLowerCase());
    if (!tx) {
      return null;
    }
    const attestation = this.getBlockAttestationStats(tx.blockHeight);
    return {
      ...tx,
      ...attestation
    };
  }

  search(query: string) {
    const q = query.trim().toLowerCase();
    if (!q) {
      return { blocks: [], transactions: [], addresses: [] as string[] };
    }
    const maxBlocks = 20;
    const maxTx = 50;
    const maxAddresses = 20;

    const blocks: Block[] = [];
    const transactions: IndexedTx[] = [];
    const addresses = new Set<string>();

    if (/^\d+$/.test(q)) {
      const byHeight = this.getBlockByHeight(Number(q));
      if (byHeight) {
        blocks.push(byHeight);
      }
    }

    // blocks by substring of hash (newest first)
    for (const block of this.blockOrderNewest) {
      if (blocks.length >= maxBlocks) {
        break;
      }
      if (block.hash.toLowerCase().includes(q)) {
        blocks.push(block);
      }
    }

    for (const tx of this.txOrder) {
      if (transactions.length >= maxTx && addresses.size >= maxAddresses) {
        break;
      }
      const txId = tx.id.toLowerCase();
      const from = tx.from.toLowerCase();
      const to = tx.to.toLowerCase();
      const txMatch = txId.includes(q) || from.includes(q) || to.includes(q);
      if (txMatch && transactions.length < maxTx) {
        transactions.push(tx);
      }
      if (from.includes(q)) {
        addresses.add(tx.from);
      }
      if (to.includes(q)) {
        addresses.add(tx.to);
      }
    }

    const contracts: string[] = [];
    for (const address of Object.keys(this.chainState.contracts ?? {})) {
      if (address.toLowerCase().includes(q) || q.length >= 8 && address.toLowerCase().includes(q.replace(/^0x/, ""))) {
        contracts.push(address);
        addresses.add(address);
      }
    }

    return {
      blocks,
      transactions,
      addresses: [...addresses].slice(0, maxAddresses),
      contracts: contracts.slice(0, 20)
    };
  }

  getTransactionsByAddress(address: string, limit = 50, offset = 0) {
    const normalized = address.toLowerCase();
    const ids = this.txByAddress.get(normalized) ?? [];
    return ids
      .slice(Math.max(0, offset), Math.max(0, offset) + Math.max(1, limit))
      .map((id) => this.txById.get(id))
      .filter((tx): tx is IndexedTx => Boolean(tx));
  }

  getTransactionsByAddressCursor(address: string, limit = 50, cursor?: string) {
    const normalized = address.toLowerCase();
    const max = Math.max(1, limit);
    const ids = this.txByAddress.get(normalized) ?? [];
    let start = 0;
    if (cursor) {
      const index = ids.findIndex((id) => id === cursor.toLowerCase());
      if (index >= 0) {
        start = index + 1;
      }
    }
    const selected = ids.slice(start, start + max);
    const items = selected.map((id) => this.txById.get(id)).filter((tx): tx is IndexedTx => Boolean(tx));
    const nextCursor = items.length === max && items[items.length - 1] ? items[items.length - 1]!.id : null;
    return { items, nextCursor };
  }

  getAccount(address: string) {
    const normalized = address.toLowerCase();
    const meta = lookupAddressMetadata(this.chainState, normalized);
    const storageKey = resolveAccountStorageKey(this.chainState, normalized);
    const account = this.chainState.accounts[storageKey] ?? {
      balance: 0,
      balances: { [NATIVE_ASSET_ID]: 0 },
      nonce: 0
    };
    const validator =
      this.chainState.validators[normalized] ?? this.chainState.validators[storageKey] ?? null;
    const counts = this.txCountsByAddress.get(normalized) ?? this.txCountsByAddress.get(storageKey) ?? { in: 0, out: 0 };
    return {
      address: normalized,
      balance: account.balance,
      balances: getAllBalances(account),
      nonce: account.nonce,
      incomingTxs: counts.in,
      outgoingTxs: counts.out,
      chainId: this.config.chainId,
      headHeight: this.getHead().height,
      validator: validator ?? null,
      legacy: meta.legacy,
      ...(meta.canonicalAddress ? { canonicalAddress: meta.canonicalAddress } : {})
    };
  }

  listAccounts(limit = 100, offset = 0) {
    return Object.entries(this.chainState.accounts)
      .map(([address, account]) => {
        const counts = this.txCountsByAddress.get(address.toLowerCase()) ?? { in: 0, out: 0 };
        return {
          address,
          balance: account.balance,
          balances: getAllBalances(account),
          nonce: account.nonce,
          incomingTxs: counts.in,
          outgoingTxs: counts.out
        };
      })
      .sort((left, right) => right.balance - left.balance || left.address.localeCompare(right.address))
      .slice(Math.max(0, offset), Math.max(0, offset) + Math.max(1, limit));
  }

  getAsset(assetId: string) {
    return getAsset(this.chainState, assetId);
  }

  listAssets() {
    return listAssets(this.chainState);
  }

  getNft(nftId: string) {
    return getNft(this.chainState, nftId);
  }

  listNfts() {
    return listNfts(this.chainState);
  }

  listOwnedNfts(owner: string) {
    return listOwnedNfts(this.chainState, owner);
  }

  listContracts() {
    return listContracts(this.chainState);
  }

  getContract(address: string) {
    return getContract(this.chainState, address);
  }

  staticContractCall(body: { from?: string; to: string; data?: string; gasLimit?: number }) {
    const cap = this.getContractCallMaxGas();
    const requested = body.gasLimit ?? cap;
    const gasLimit = Math.min(Math.max(1, Math.floor(requested)), cap);
    return staticContractCall(
      this.chainState,
      body.from ?? "0x" + "00".repeat(20),
      body.to,
      body.data ?? "0x",
      gasLimit
    );
  }

  getContractParams() {
    return {
      gasPricePpl: contractGasPricePpl(),
      blockGasLimit: contractBlockGasLimit(),
      defaultTxGasLimit: DEFAULT_TX_GAS_LIMIT,
      typicalDeployGas: TYPICAL_CONTRACT_DEPLOY_GAS,
      quoteTypicalDeployFeePpl: quoteContractFeePpl(TYPICAL_CONTRACT_DEPLOY_GAS),
      quoteDeployFeePpl: quoteContractFeePpl(DEFAULT_TX_GAS_LIMIT),
      ownerApprovedPublicTariff: true
    };
  }

  getAccountBalances(address: string) {
    const account = this.chainState.accounts[address.toLowerCase()] ?? {
      balance: 0,
      balances: { [NATIVE_ASSET_ID]: 0 },
      nonce: 0
    };
    return getAllBalances(account);
  }

  getAccountBalance(address: string, assetId: string) {
    const account = this.chainState.accounts[address.toLowerCase()] ?? {
      balance: 0,
      balances: { [NATIVE_ASSET_ID]: 0 },
      nonce: 0
    };
    return {
      address: address.toLowerCase(),
      assetId: assetId.trim().toLowerCase(),
      balance: getAccountBalance(account, assetId)
    };
  }

  getCommunityPool(assetId?: string) {
    if (assetId) {
      return getCommunityPoolAccounting(this.chainState.communityPool, assetId);
    }
    return this.chainState.communityPool.pools;
  }

  getCurve(assetId: string) {
    return this.chainState.curves[assetId.trim().toLowerCase()];
  }

  getCreatorVesting(assetId: string) {
    const vesting = this.chainState.vesting[assetId.trim().toLowerCase()];
    if (!vesting) return undefined;
    const currentHeight = this.getHead().height;
    const currentVested = calculateVestedAmount(vesting, currentHeight);
    const currentClaimable = Math.max(0, currentVested - vesting.claimedAmount);
    return {
      ...vesting,
      currentVested,
      currentClaimable
    };
  }

  getAssetLiquidity(assetId: string) {
    const id = assetId.trim().toLowerCase();
    const pool = Object.values(this.chainState.liquidityPools).find(
      (p) => p.tokenAssetId === id
    );
    return {
      assetId: id,
      liquidityReserve: this.chainState.liquidityReserves[id] ?? 0,
      launchReserve: this.chainState.launchReserves[id] ?? 0,
      ecosystemReserve: this.chainState.ecosystemReserves[id] ?? 0,
      pool: pool ?? null
    };
  }

  getLiquidityPool(poolId: string) {
    return this.chainState.liquidityPools[poolId];
  }

  listLiquidityPools() {
    return listLiquidityPools(this.chainState);
  }

  quoteAmmSwap(poolId: string, tokenIn: string, amountIn: number, tokenOut?: string) {
    return quoteAmmSwap(this.chainState, poolId, tokenIn, amountIn, tokenOut);
  }

  getChainConfig() {
    const blockIntervalMs = this.options.blockIntervalMs ?? DEFAULT_BLOCK_INTERVAL_MS;
    return {
      ...this.config,
      tokenSymbol: "PPL",
      tokenName: "People",
      suggestedFee: DEFAULT_TRANSFER_FEE,
      faucetEnabled: this.isPublicFaucetEnabled(),
      consensus: "leader-based-pos",
      blockIntervalMs,
      maxTxPerBlock: MAX_TRANSACTIONS_PER_BLOCK,
      maxThroughputTps: computeMaxThroughputTps(MAX_TRANSACTIONS_PER_BLOCK, blockIntervalMs),
      maxBatchRecipients: 50,
      suggestedBatchFeeBase: BATCH_FEE_BASE
    };
  }

  listProposals() {
    return Object.values(this.chainState.proposals).sort((a, b) => b.createdEpoch - a.createdEpoch);
  }

  private getAllTransactions() {
    return this.txOrder;
  }

  buildBootstrapBundle(address: string, kind: "full" | "light") {
    const bundle = this.gossip.buildJoinBundle(address);
    return JSON.stringify({ ...bundle, nodeKind: kind, apiUrl: process.env.PUBLIC_API_URL ?? "" });
  }

  allowTx(from: string): boolean {
    const now = Date.now();
    const bucket = this.txRateMap.get(from) ?? { count: 0, windowStart: now };
    if (now - bucket.windowStart > 60_000) {
      bucket.count = 0;
      bucket.windowStart = now;
    }
    bucket.count += 1;
    this.txRateMap.set(from, bucket);
    return bucket.count <= 120;
  }

  allowFaucet(address: string): boolean {
    const now = Date.now();
    const windowMs = Number(process.env.FAUCET_WINDOW_MS ?? 60_000);
    const limit = Number(process.env.FAUCET_RATE_LIMIT ?? 5);
    const bucket = this.faucetRateMap.get(address) ?? { count: 0, windowStart: now };
    if (now - bucket.windowStart > windowMs) {
      bucket.count = 0;
      bucket.windowStart = now;
    }
    bucket.count += 1;
    this.faucetRateMap.set(address, bucket);
    return bucket.count <= limit;
  }

  /** Per-IP token bucket for `POST /contracts/call` (non-consensus node policy). */
  allowContractCall(clientKey: string): boolean {
    const now = Date.now();
    const bucket = this.contractCallRateMap.get(clientKey) ?? { count: 0, windowStart: now };
    if (now - bucket.windowStart > 60_000) {
      bucket.count = 0;
      bucket.windowStart = now;
    }
    bucket.count += 1;
    this.contractCallRateMap.set(clientKey, bucket);
    return bucket.count <= this.contractCallRateLimitPerMinute;
  }

  getContractCallMaxGas(): number {
    return Math.min(this.contractCallMaxGas, DEFAULT_TX_GAS_LIMIT);
  }

  private expirePendingTransactions(): void {
    const now = Date.now();
    const oldLength = this.chainState.mempool.length;
    this.chainState.mempool = this.chainState.mempool.filter(tx => {
      const firstSeen = this.pendingSince.get(tx.id) ?? now;
      this.pendingSince.set(tx.id, firstSeen);
      return now - firstSeen < this.mempoolTtlMs;
    });
    const pendingIds = new Set(this.chainState.mempool.map(tx => tx.id));
    for (const id of this.pendingSince.keys()) if (!pendingIds.has(id)) this.pendingSince.delete(id);
    if (oldLength !== this.chainState.mempool.length) this.queuePersist();
  }

  private signLocalTransaction(key: string, tx: Transaction): Transaction {
    return signTransaction(key, tx, securityUpgradeActive(this.config, this.getHead().height + 1));
  }

  /**
   * Relay-only anti-spam quota. Several transaction types still have no minimum tariff
   * (AMM/curve), so a fee-less flood could otherwise fill the mempool and crowd out
   * fee-paying transfers. Onboarding transactions are exempt (fee 0 by rule) and locally
   * submitted transactions are left to the HTTP rate limit and the operator's intent.
   */
  private assertFreeTxQuota(tx: Transaction): void {
    if (tx.fee > 0 || tx.type === "registerParticipant" || tx.type === "participantReferral") {
      return;
    }
    let pendingFree = 0;
    for (const pending of this.chainState.mempool) {
      if (
        pending.fee <= 0 &&
        pending.type !== "registerParticipant" &&
        pending.type !== "participantReferral"
      ) {
        pendingFree += 1;
      }
    }
    if (pendingFree >= MAX_PENDING_FREE_TXS) {
      throw new Error("mempool_free_quota");
    }
  }

  private admitTransaction(tx: Transaction, remote = false): void {
    this.expirePendingTransactions();
    if (!verifyTransaction(tx)) throw new Error("Invalid transaction signature");
    validateMempoolSpending(this.chainState, tx, tx.from !== FAUCET_ADDRESS);
    if (!this.allowTx(tx.from)) throw new Error("rate_limited");
    if (remote) {
      this.assertFreeTxQuota(tx);
    }
    enqueueTransaction(this.chainState, tx, false);
    this.pendingSince.set(tx.id, Date.now());
  }

  submitTransaction(tx: Transaction): { accepted: boolean; error?: string } {
    try {
      this.admitTransaction(tx);
      this.gossip.publishTx(tx);
      this.queuePersist();
      this.live.emit("event", { type: "tx", payload: tx } satisfies LiveEvent);
      this.publishLiveState(undefined, false);
      return { accepted: true };
    } catch (error) {
      this.rejectedTxCount += 1;
      return {
        accepted: false,
        error: error instanceof Error ? error.message : "tx_rejected"
      };
    }
  }

  fundFromFaucet(to: string, amount: number): Transaction {
    if (!this.isPublicFaucetEnabled()) {
      throw new Error("faucet_disabled");
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("invalid_amount");
    }
    if (amount > this.faucetMaxAmount()) {
      throw new Error("faucet_amount_capped");
    }
    const dailyCap = this.faucetDailyCapAmount();
    if (dailyCap !== null) {
      const day = Math.floor(Date.now() / 86_400_000);
      if (day !== this.faucetPayoutDay) {
        this.faucetPayoutDay = day;
        this.faucetPayoutAmount = 0;
      }
      if (this.faucetPayoutAmount + amount > dailyCap) {
        throw new Error("faucet_daily_budget_exhausted");
      }
    }
    // The faucet key signs one tx at a time with the account nonce: a second request while
    // one is still pending would reuse the nonce and be rejected. Report that honestly as
    // `faucet_busy` (503) instead of a generic bad-request.
    if (this.chainState.mempool.some((tx) => tx.from === FAUCET_ADDRESS)) {
      throw new Error("faucet_busy");
    }
    const faucet = this.chainState.accounts[FAUCET_ADDRESS];
    const tx = this.signLocalTransaction(DEV_FAUCET_PRIVATE_KEY, {
      id: `faucet-${to}-${Date.now()}`,
      from: FAUCET_ADDRESS,
      to,
      amount,
      fee: 0,
      nonce: faucet?.nonce ?? 0,
      timestamp: Date.now(),
      type: "transfer"
    });
    const result = this.submitTransaction(tx);
    if (result.accepted && dailyCap !== null) {
      this.faucetPayoutAmount += amount;
    }
    if (!result.accepted) {
      throw new Error(result.error ?? "faucet_submit_failed");
    }
    return tx;
  }

  reportSecurity(validator: string, evidence: SlashEvidence, token?: string): { ok: boolean; error?: string } {
    // OPS-M3: this is the "admin"-tier endpoint ALLOW_DEV_ENDPOINTS/DEV_API_TOKEN were meant to
    // gate (see README). Without this check, a production node started without DEV_API_TOKEN set
    // (e.g. `docker run` without the compose overrides) would accept unauthenticated slash reports.
    if (!this.isDevEndpointAllowed(token)) {
      return { ok: false, error: "unauthorized" };
    }
    if (typeof validator !== "string" || !validator.trim() || !evidence || typeof evidence !== "object") {
      return { ok: false, error: "invalid_evidence" };
    }
    const payload = { ...evidence, validator: evidence.validator || validator };
    if (!verifySlashEvidence(this.chainState, payload)) {
      return { ok: false, error: "invalid_evidence" };
    }
    const submitted = this.submitSlashEvidenceTx(payload);
    return submitted ? { ok: true } : { ok: false, error: "submit_failed" };
  }

  async prune(height?: number): Promise<void> {
    const keepFrom = height ?? Math.max(0, this.getHead().height - CHAIN_WINDOW_BLOCKS + 1);
    if (!this.archiveMode) await this.store.pruneBefore(keepFrom);
    const trimmed = trimChainWindow(this.chainState, CHAIN_WINDOW_BLOCKS);
    this.prunedBeforeHeight = Math.max(this.prunedBeforeHeight, keepFrom, trimmed.prunedBefore);
    this.rebuildTransactionIndexes();
    this.queuePersist();
  }

  private backfillCounters(): void {
    const scannedTx = countTotalTransactions(this.chainState);
    if (this.totalTransactions === 0 && scannedTx > 0) {
      this.totalTransactions = scannedTx;
    }
    if (this.totalValidatorRewards === 0 && this.rewardHistory.length > 0) {
      this.totalValidatorRewards = this.rewardHistory.reduce(
        (sum, item) => sum + sumDistributedRewards(item),
        0
      );
    }
  }

  /** Drop phantom epoch totals that were recorded with no validators paid. */
  private sanitizeRewardTotals(): void {
    let phantom = 0;
    for (const entry of this.rewardHistory) {
      const paid = sumDistributedRewards(entry);
      if (entry.totalReward > paid) {
        phantom += entry.totalReward - paid;
        entry.totalReward = paid;
      }
    }
    if (this.latestReward) {
      const paid = sumDistributedRewards(this.latestReward);
      if (this.latestReward.totalReward > paid) {
        this.latestReward.totalReward = paid;
      }
    }
    if (phantom > 0) {
      this.totalValidatorRewards = Math.max(0, this.totalValidatorRewards - phantom);
    }
  }

  private recordEpochReward(reward: RewardDistribution): void {
    const paid = sumDistributedRewards(reward);
    reward.totalReward = paid;
    if (paid <= 0) {
      return;
    }
    this.totalValidatorRewards += paid;
    this.latestReward = reward;
    this.rewardHistory.push(reward);
    if (this.rewardHistory.length > 500) {
      this.rewardHistory = this.rewardHistory.slice(-500);
    }
  }

  private async handleBlocksResponse(blocks: Block[]): Promise<void> {
    const sorted = [...blocks].sort((a, b) => a.header.height - b.header.height);
    if (sorted.length === 0) {
      return;
    }

    let applied = 0;
    for (const block of sorted) {
      if (await this.applyRemoteBlock(block)) {
        applied += 1;
      }
    }

    if (applied === 0 && sorted.length > 0) {
      const remoteChain = this.buildRemoteChainCandidate(sorted);
      const targetHeight = sorted[sorted.length - 1]!.header.height;
      const checkpoint = await this.store.getNearestCheckpoint(targetHeight);
      const chosen = checkpoint
        ? await chooseForkWithCheckpoint(this.chainState, remoteChain, this.config, {
            state: checkpoint.chainState,
            height: checkpoint.height
          })
        : await chooseFork(this.chainState, remoteChain, this.config);
      if (chosen) {
        if (this.archiveMode) for (const block of chosen.chain) await this.store.archiveBlock(block);
        this.chainState = chosen;
        if (chosen.networkConfig) Object.assign(this.config, chosen.networkConfig);
        this.feePool = chosen.pendingValidatorFees ?? 0;
        this.rebuildTransactionIndexes();
        this.backfillCounters();
        this.queuePersistDurable();
        this.publishLiveState(undefined, true);
      }
    }
  }

  private buildRemoteChainCandidate(blocks: Block[]): Block[] {
    const head = this.chainState.chain[this.chainState.chain.length - 1]!;
    const first = blocks[0];
    if (first && first.header.height === head.header.height + 1 && first.header.previousHash === head.hash) {
      return [...this.chainState.chain, ...blocks];
    }
    return blocks;
  }

  private async applyRemoteBlock(block: Block): Promise<boolean> {
    const head = this.getHead().height;
    if (block.header.height > head + 1) {
      this.gossip.requestBlocks(head + 1, Math.min(block.header.height, head + 99));
      return false;
    }
    const evidence = noteSeenBlock(this.chainState, block);
    if (evidence) {
      this.handleSlashCandidate(evidence);
    }
    const applied = await tryApplyRemoteBlock(this.chainState, block, this.config);
    if (applied) {
      await this.store.archiveBlock(block);
      this.feePool = this.chainState.pendingValidatorFees ?? 0;
      if (block.header.height % 10 === 0 && this.chainState.lastEpochReward) this.recordEpochReward(this.chainState.lastEpochReward);
      this.recordBlockApplied(block);
      this.maybeAutoAttest();
      this.queuePersistDurable();
      this.publishLiveState(block, true);
    }
    return applied;
  }

  /**
   * M10-3: the block is archived and published before the chain snapshot is written, so a crash
   * in between leaves the snapshot one or more blocks behind the block this node already signed.
   * Re-proposing at that height would be equivocation (double-sign evidence, auto-slash), so the
   * node replays the blocks it signed from its own archive instead, and if the archive is gone
   * (non-archive nodes) remembers the height and refuses to sign at or below it again.
   */
  private async recoverSignedBlocks(): Promise<void> {
    const record = await this.store.loadSigningRecord().catch(() => null);
    if (!record) return;
    this.lastSignedHeight = Math.max(this.lastSignedHeight, record.height);
    const head = this.getHead().height;
    if (record.height <= head) return;
    const replay: Block[] = [];
    for (let height = head + 1; height <= record.height; height++) {
      const block = await this.store.getBlock(height).catch(() => null);
      if (!block || block.header.height !== height) break;
      replay.push(block);
    }
    if (replay.length > 0) {
      await this.handleBlocksResponse(replay);
      // Archive round-trip and replay must land on the block that was signed; anything else
      // means local history is inconsistent, and re-signing is not a safe repair.
      const recovered = this.getBlockByHeight(record.height);
      if (!recovered || recovered.hash !== record.hash) {
        throw new Error(
          `Signed block ${record.height} (${record.hash}) could not be recovered from local history; ` +
            "refusing to start rather than sign a second block at that height (M10-3)."
        );
      }
    }
  }

  private requestCatchUp(): void {
    const head = this.getHead().height;
    this.gossip.requestBlocks(Math.max(0, head - 5), head + 50);
  }

  private handleRemoteTx(tx: Transaction): void {
    try {
      this.admitTransaction(tx, true);
      this.queuePersist();
      this.live.emit("event", { type: "tx", payload: tx } satisfies LiveEvent);
      this.publishLiveState(undefined, false);
    } catch {
      this.rejectedTxCount += 1;
      // ignore invalid remote tx
    }
  }

  private handleRemoteBlock(block: Block): void {
    void this.serialize(() => this.applyRemoteBlock(block)).catch(() => { this.rejectedTxCount += 1; });
  }

  private handleSlashCandidate(evidence: SlashEvidence): void {
    const key = `${evidence.type}:${evidence.validator}:${evidence.height}:${evidence.blockHashA}:${evidence.blockHashB}`;
    if (this.submittedSlashKeys.has(key)) {
      return;
    }
    this.latestSlashCandidate = evidence;
    this.live.emit("event", { type: "slash_candidate", payload: evidence } satisfies LiveEvent);
    if (this.submitSlashEvidenceTx(evidence)) {
      this.submittedSlashKeys.add(key);
    }
  }

  private submitSlashEvidenceTx(evidence: SlashEvidence): boolean {
    const reporterKey = this.localValidatorPrivateKey || DEV_FAUCET_PRIVATE_KEY;
    if (!reporterKey) return false;
    const reporterAddress = this.localValidatorAddress || FAUCET_ADDRESS;
    try {
      const account = this.chainState.accounts[reporterAddress];
      const tx = this.signLocalTransaction(reporterKey, {
        id: `slash-${evidence.validator}-${evidence.height}-${Date.now()}`,
        from: reporterAddress,
        to: "network",
        amount: 0,
        fee: 0,
        nonce: account?.nonce ?? 0,
        timestamp: Date.now(),
        type: "slashEvidence",
        payload: { ...evidence, reporter: reporterAddress }
      });
      const result = this.submitTransaction(tx);
      return result.accepted;
    } catch {
      return false;
    }
  }

  private maybeAutoAttest(): void {
    if (!this.localValidatorPrivateKey || !this.localValidatorAddress) {
      return;
    }
    const validator = this.chainState.validators[this.localValidatorAddress];
    if (!validator || (validator.status !== "active" && validator.status !== "joining")) {
      return;
    }
    const finalized = this.chainState.finalizedHeight;
    const head = this.chainState.chain[this.chainState.chain.length - 1];
    if (!head || head.header.height <= finalized) {
      return;
    }
    const fromHeight = Math.max(finalized + 1, this.lastAutoAttestedHeight + 1);
    const toHeight = head.header.height;
    for (let height = fromHeight; height <= toHeight && height <= fromHeight + 4; height += 1) {
      const block = this.blockByHeight.get(height) ?? this.chainState.chain.find((b) => b.header.height === height);
      if (!block) {
        continue;
      }
      try {
        const account = this.chainState.accounts[this.localValidatorAddress];
        const tx = this.signLocalTransaction(this.localValidatorPrivateKey, {
          id: `${this.localValidatorAddress}-att-${height}-${Date.now()}`,
          from: this.localValidatorAddress,
          to: "network",
          amount: 0,
          fee: 0,
          nonce: account?.nonce ?? 0,
          timestamp: Date.now(),
          type: "attestation",
          payload: { headerHeight: height, blockHash: block.hash, kind: validator.nodeKind }
        });
        const result = this.submitTransaction(tx);
        if (result.accepted) {
          this.lastAutoAttestedHeight = height;
        }
      } catch {
        // skip attestation failures
      }
    }
  }

  private transition: Promise<unknown> = Promise.resolve();
  private serialize<T>(action: () => Promise<T>): Promise<T> {
    const result = this.transition.then(action);
    this.transition = result.catch(() => undefined);
    return result;
  }
  private proposing = false;

  private tick(): void {
    void this.serialize(() => this.tickAsync());
  }

  private async tickAsync(): Promise<void> {
    this.expirePendingTransactions();
    if (this.proposing) {
      return;
    }
    this.proposing = true;
    try {
      const nextHeight = this.getHead().height + 1;
      if (nextHeight <= this.lastSignedHeight) {
        // A block at this height was already signed before the last restart and has not been
        // replayed yet. Signing another one now would be equivocation; wait for sync instead.
        return;
      }
      const proposer = selectProposer(this.chainState, nextHeight);
      const shouldPropose =
        (proposer === "bootstrap-validator" && Boolean(process.env.BOOTSTRAP_PRIVATE_KEY)) ||
        (proposer === this.localValidatorAddress && Boolean(this.localValidatorPrivateKey));

      if (!shouldPropose) {

        if (this.pendingExpectedHeight !== nextHeight) {
          this.pendingExpectedHeight = nextHeight;
          this.pendingHeightSince = Date.now();
        } else {
          const timeoutMs = (this.options.blockIntervalMs ?? DEFAULT_BLOCK_INTERVAL_MS) * 2;
          if (Date.now() - this.pendingHeightSince >= timeoutMs) {
            // Miss observations are local telemetry, not consensus state.
            this.pendingHeightSince = Date.now();
            this.queuePersist();
            this.publishLiveState(undefined, false);
          }
        }
        return;
      }

      this.pendingExpectedHeight = 0;
      this.pendingHeightSince = 0;
      const block = await buildBlock(this.chainState, proposer, this.config, proposer === "bootstrap-validator" ? process.env.BOOTSTRAP_PRIVATE_KEY : this.localValidatorPrivateKey);
      await this.store.archiveBlock(block);
      // Durable before the block is gossiped (M10-3): if the process dies before the snapshot
      // is persisted, the restart must know this height was already signed.
      await this.store.saveSigningRecord({ height: block.header.height, hash: block.hash });
      this.lastSignedHeight = block.header.height;
      noteSeenBlock(this.chainState, block);
      this.gossip.publishBlock(block);
      this.recordBlockApplied(block);
      this.maybeAutoAttest();


      if (block.header.height % 10 === 0) {
        const reward = this.chainState.lastEpochReward;
        if (reward) this.recordEpochReward(reward);
        this.feePool = this.chainState.pendingValidatorFees ?? 0;
        if (this.chainState.chain.length > CHAIN_WINDOW_BLOCKS) {
          void this.prune(this.getHead().height - CHAIN_WINDOW_BLOCKS + 1);
        }
      }
      this.queuePersistDurable();
      this.publishLiveState(block, true);
    } catch {
      // block production can fail when mempool has invalid pending tx
    } finally {
      this.proposing = false;
    }
  }

  private rebuildTransactionIndexes(): void {
    this.txById.clear();
    this.txOrder = [];
    this.txByAddress.clear();
    this.txCountsByAddress.clear();
    this.blockOrderNewest = [];
    this.blockByHeight.clear();
    this.blockByHash.clear();

    this.blockOrderNewest = this.chainState.chain.slice().reverse();
    for (const block of this.chainState.chain) {
      this.blockByHeight.set(block.header.height, block);
      this.blockByHash.set(block.hash.toLowerCase(), block);
      for (const tx of block.transactions) {
        const indexed: IndexedTx = {
          ...tx,
          blockHeight: block.header.height,
          blockHash: block.hash
        };
        this.indexTransaction(indexed);
      }
    }
  }

  private indexTransaction(tx: IndexedTx): void {
    const key = tx.id.toLowerCase();
    if (this.txById.has(key)) {
      return;
    }
    this.txById.set(key, tx);
    this.txOrder.unshift(tx);

    const recipientPayload = tx.payload?.recipients;
    const batchTos =
      Array.isArray(recipientPayload)
        ? recipientPayload
            .map((item) =>
              item && typeof item === "object" && typeof (item as { to?: unknown }).to === "string"
                ? String((item as { to: string }).to).toLowerCase()
                : ""
            )
            .filter(Boolean)
        : [];
    const related = new Set<string>([tx.from.toLowerCase(), tx.to.toLowerCase(), ...batchTos]);

    for (const address of related) {
      const list = this.txByAddress.get(address) ?? [];
      list.unshift(key);
      if (list.length > 2_000) {
        list.length = 2_000;
      }
      this.txByAddress.set(address, list);
    }

    const from = tx.from.toLowerCase();
    const fromCounts = this.txCountsByAddress.get(from) ?? { in: 0, out: 0 };
    fromCounts.out += 1;
    this.txCountsByAddress.set(from, fromCounts);

    if (batchTos.length > 0) {
      for (const to of batchTos) {
        const toCounts = this.txCountsByAddress.get(to) ?? { in: 0, out: 0 };
        toCounts.in += 1;
        this.txCountsByAddress.set(to, toCounts);
      }
    } else {
      const to = tx.to.toLowerCase();
      const toCounts = this.txCountsByAddress.get(to) ?? { in: 0, out: 0 };
      toCounts.in += 1;
      this.txCountsByAddress.set(to, toCounts);
    }
  }

  private recordBlockTransactions(block: Block): void {
    for (const tx of block.transactions) {
      this.indexTransaction({
        ...tx,
        blockHeight: block.header.height,
        blockHash: block.hash
      });
    }
  }

  private recordBlockApplied(block: Block): void {
    this.totalTransactions += block.transactions.length;
    this.blockOrderNewest.unshift(block);
    this.blockByHeight.set(block.header.height, block);
    this.blockByHash.set(block.hash.toLowerCase(), block);
    this.recordBlockTransactions(block);
  }

  private queuePersist(delayMs = 250): void {
    this.persistQueued = true;
    if (this.persistTimer || this.persistInFlight) {
      return;
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.flushPersist();
    }, delayMs);
  }

  /** Persist ASAP (used after each block so a crash loses at most the in-flight write). */
  private queuePersistDurable(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.persistQueued = true;
    void this.flushPersist();
  }

  private async flushPersist(): Promise<void> {
    if (this.persistInFlight || !this.persistQueued) {
      return;
    }
    this.persistInFlight = true;
    this.persistQueued = false;
    try {
      await this.persist();
    } finally {
      this.persistInFlight = false;
      if (this.persistQueued) {
        this.queuePersist(100);
      }
    }
  }

  private async persist(): Promise<void> {
    await this.store.save({
      chainState: this.chainState,
      feePool: this.feePool,
      latestReward: this.latestReward,
      totalValidatorRewards: this.totalValidatorRewards,
      totalTransactions: this.totalTransactions,
      rewardHistory: this.rewardHistory
    });
  }
}
