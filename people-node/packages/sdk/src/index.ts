import { transactionIdPayload } from "@ovn/protocol";
import * as secp from "@noble/secp256k1";
import { hmac } from "@noble/hashes/hmac.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import type {
  AssetMetadata,
  AssetPoolAccounting,
  Block,
  ChainSnapshot,
  CommunityPoolState,
  CreatorVestingState,
  CurveState,
  GovernanceProposal,
  HealthDetailsResponse,
  HealthResponse,
  LiquidityPoolState,
  AmmQuote,
  MetricsResponse,
  NetworkConfig,
  NftRecord,
  RewardDistribution,
  SearchResponse,
  SlashEvidence,
  TokenAllocation,
  Transaction,
  Validator
} from "@ovn/protocol";
import {
  BATCH_FEE_BASE_PPL,
  BATCH_FEE_CAP_PPL,
  BATCH_FEE_PER_EXTRA_PPL,
  DEFAULT_NFT_MINT_MIN_FEE,
  DEFAULT_TOKEN_CREATE_MIN_FEE,
  DEFAULT_TRANSFER_FEE_PPL,
  DEFAULT_TX_GAS_LIMIT
} from "@ovn/protocol";

secp.hashes.sha256 = sha256;
secp.hashes.hmacSha256 = (key, msg) => hmac(sha256, key, msg);

const { bytesToHex, hexToBytes } = secp.etc;

export interface OvnClientOptions {
  baseUrl: string;
  apiToken?: string;
  /**
   * Pin the chain id this client signs for. When set, the value is used verbatim and the
   * node's `/health` answer is only cross-checked against it (a mismatch throws), so a
   * node cannot talk the client into signing a transaction for a different chain.
   */
  chainId?: string;
}
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | number | null;
  mode: "cursor";
}

export interface KeyPair {
  privateKey: string;
  publicKey: string;
  address: string;
}

export class OvnApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown
  ) {
    super(message);
    this.name = "OvnApiError";
  }
}

export function legacyAddressFromPublicKey(publicKeyHex: string): string {
  return `0x${bytesToHex(sha256(hexToBytes(publicKeyHex.replace(/^0x/i, "")))).slice(0, 40)}`;
}

function evmAddressFromPublicKey(publicKeyHex: string): string {
  const hex = publicKeyHex.replace(/^0x/i, "");
  const uncompressed = secp.Point.fromHex(hex).toBytes(false);
  const hash = keccak_256(uncompressed.slice(1));
  return `0x${bytesToHex(hash.slice(-20))}`;
}

function useEvmCanonicalAddresses(): boolean {
  const raw = (
    process.env.EVM_CANONICAL_ADDRESSES ??
    process.env.NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES ??
    ""
  )
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "evm";
}

/** Default legacy (sha256) until `EVM_CANONICAL_ADDRESSES` / `NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES` is enabled. */
export function addressFromPublicKey(publicKeyHex: string): string {
  return useEvmCanonicalAddresses()
    ? evmAddressFromPublicKey(publicKeyHex)
    : legacyAddressFromPublicKey(publicKeyHex);
}

export function generateKeyPair(): KeyPair {
  const privateKey = bytesToHex(secp.utils.randomSecretKey());
  return keyPairFromPrivateKey(privateKey);
}

export function keyPairFromPrivateKey(privateKeyHex: string): KeyPair {
  const secretKey = hexToBytes(privateKeyHex.replace(/^0x/, ""));
  const publicKey = bytesToHex(secp.getPublicKey(secretKey, true));
  return {
    privateKey: bytesToHex(secretKey),
    publicKey,
    address: addressFromPublicKey(publicKey)
  };
}

function canonicalTxPayload(tx: Transaction): string {
  const { signature: _s, publicKey: _p, ...rest } = tx;
  return JSON.stringify(rest);
}

export const MAX_TRANSFER_MEMO_LENGTH = 256;

function validateTransferMemo(memo: string | undefined): void {
  if (memo === undefined) {
    return;
  }
  if (typeof memo !== "string") {
    throw new Error("Invalid memo");
  }
  if (memo.length > MAX_TRANSFER_MEMO_LENGTH) {
    throw new Error("Memo too long");
  }
}

export function formatTxMemo(memo: string, max = 48): string {
  if (memo.length <= max) {
    return memo;
  }
  return `${memo.slice(0, max - 1)}…`;
}

export interface SendTransferOptions {
  to: string;
  amount: number;
  nonce: number;
  fee?: number;
  memo?: string;
  assetId?: string;
}

export interface BatchRecipientInput {
  to: string;
  amount: number;
  memo?: string;
}

export interface SendBatchTransferOptions {
  recipients: BatchRecipientInput[];
  nonce: number;
  fee?: number;
}

export const MAX_BATCH_RECIPIENTS = 50;
export const BATCH_FEE_BASE = BATCH_FEE_BASE_PPL;
export const BATCH_FEE_PER_EXTRA = BATCH_FEE_PER_EXTRA_PPL;
export const BATCH_FEE_CAP = BATCH_FEE_CAP_PPL;
export const DEFAULT_TRANSFER_FEE = DEFAULT_TRANSFER_FEE_PPL;
export {
  DEFAULT_NFT_MINT_MIN_FEE,
  DEFAULT_TOKEN_CREATE_MIN_FEE,
  DEFAULT_TRANSFER_FEE_PPL
} from "@ovn/protocol";

export function suggestedBatchFee(recipientCount: number): number {
  const n = Math.max(1, recipientCount);
  return Math.min(BATCH_FEE_CAP, BATCH_FEE_BASE + BATCH_FEE_PER_EXTRA * Math.max(0, n - 1));
}

/** Fallback when live metrics are unavailable. */
export function suggestedTransferFee(mempoolSize = 0, medianPendingFee = DEFAULT_TRANSFER_FEE): number {
  let fee = Math.max(DEFAULT_TRANSFER_FEE, medianPendingFee);
  if (mempoolSize >= 200) {
    fee = Math.max(fee, DEFAULT_TRANSFER_FEE * 2.5);
  } else if (mempoolSize >= 50) {
    fee = Math.max(fee, DEFAULT_TRANSFER_FEE * 1.5);
  }
  return Math.round(fee * 1000) / 1000;
}

export function recommendedFeeForSend(options: {
  mode: "single" | "batch";
  recipientCount?: number;
  networkSuggested?: number;
}): number {
  const network = options.networkSuggested ?? DEFAULT_TRANSFER_FEE;
  if (options.mode === "batch") {
    return Math.max(suggestedBatchFee(options.recipientCount ?? 1), network);
  }
  return network;
}

export function getBatchRecipients(
  tx: Pick<Transaction, "payload" | "type">
): Array<{ to: string; amount: number; memo?: string }> | null {
  if (tx.type !== "transfer") {
    return null;
  }
  const raw = tx.payload?.recipients;
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }
  const recipients: Array<{ to: string; amount: number; memo?: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return null;
    }
    const entry = item as { to?: unknown; amount?: unknown; memo?: unknown };
    if (typeof entry.to !== "string" || !Number.isFinite(Number(entry.amount))) {
      return null;
    }
    const memo = typeof entry.memo === "string" ? entry.memo.trim() : "";
    recipients.push({
      to: entry.to,
      amount: Number(entry.amount),
      ...(memo ? { memo } : {})
    });
  }
  return recipients;
}

export function getTxMemo(tx: Pick<Transaction, "payload" | "type">): string | null {
  // Prefer single-payment memo. For batch, use helpers that read per-recipient memo.
  if (tx.type === "transfer" && Array.isArray(tx.payload?.recipients)) {
    return null;
  }
  const memo = tx.payload?.memo;
  if (typeof memo !== "string") {
    return null;
  }
  const trimmed = memo.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getPaymentMemoForAddress(
  tx: Pick<Transaction, "payload" | "type" | "to">,
  address: string
): string | null {
  const normalized = address.toLowerCase();
  const recipients = getBatchRecipients(tx);
  if (recipients) {
    const match = recipients.find((item) => item.to.toLowerCase() === normalized);
    return match?.memo?.trim() || null;
  }
  if (tx.to.toLowerCase() === normalized) {
    return getTxMemo(tx);
  }
  return getTxMemo(tx);
}

export function formatPaymentMemos(
  tx: Pick<Transaction, "payload" | "type">,
  max = 48
): string | null {
  const recipients = getBatchRecipients(tx);
  if (recipients) {
    const memos = recipients.map((item) => item.memo?.trim()).filter(Boolean) as string[];
    if (memos.length === 0) {
      return null;
    }
    if (memos.length === 1) {
      return formatTxMemo(memos[0]!, max);
    }
    return formatTxMemo(`${memos[0]} (+${memos.length - 1})`, max);
  }
  const memo = getTxMemo(tx);
  return memo ? formatTxMemo(memo, max) : null;
}

export function signTransaction(privateKeyHex: string, tx: Transaction): Transaction {
  const secretKey = hexToBytes(privateKeyHex.replace(/^0x/, ""));
  const publicKey = bytesToHex(secp.getPublicKey(secretKey, true));
  if (!tx.chainId) throw new Error("Transaction chainId is required");
  tx = { ...tx, from: addressFromPublicKey(publicKey) };
  tx = { ...tx, id: bytesToHex(sha256(new TextEncoder().encode(transactionIdPayload(tx)))) };
  const message = new TextEncoder().encode(canonicalTxPayload(tx));
  const signature = bytesToHex(secp.sign(message, secretKey));
  return {
    ...tx,
    from: addressFromPublicKey(publicKey),
    publicKey,
    signature
  };
}

export class OvnClient {
  private healthPromise?: Promise<HealthResponse>;

  constructor(private readonly options: OvnClientOptions) {}

  private headers(json = false): HeadersInit {
    const headers: Record<string, string> = {};
    if (json) {
      headers["content-type"] = "application/json";
    }
    if (this.options.apiToken) {
      headers["x-api-token"] = this.options.apiToken;
    }
    return headers;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.options.baseUrl}${path}`, init);
    const body = await res.json().catch(() => undefined);
    if (!res.ok) {
      throw new OvnApiError(
        typeof body === "object" && body && "error" in body
          ? String((body as { error: string }).error)
          : `${res.status} ${res.statusText}`,
        res.status,
        body
      );
    }
    return body as T;
  }

  async getHealth(): Promise<HealthResponse> {
    return this.request("/health");
  }

  /**
   * Chain id to sign with. A client that pinned `chainId` never takes it from the node; the
   * node's report is only checked against the pinned value (once per client instance).
   */
  private async resolveChainId(): Promise<string> {
    const pinned = this.options.chainId?.trim();
    if (!pinned) {
      return (await this.getHealth()).chainId;
    }
    this.healthPromise ??= this.getHealth();
    const health = await this.healthPromise;
    if (health.chainId !== pinned) {
      throw new Error(`chain_id_mismatch: node reports ${health.chainId}, client pinned ${pinned}`);
    }
    return pinned;
  }

  async getHealthDetails(): Promise<HealthDetailsResponse> {
    return this.request("/health/details");
  }

  async getMetrics(): Promise<MetricsResponse> {
    return this.request("/metrics");
  }

  async getHead(): Promise<ChainSnapshot["head"]> {
    return this.request("/chain/head");
  }

  async getSnapshot(): Promise<ChainSnapshot & { epoch?: number }> {
    return this.request("/snapshot");
  }

  async getChainConfig(): Promise<NetworkConfig & { suggestedFee: number; consensus: string }> {
    return this.request("/chain/config");
  }

  async getBlocks(limit = 10, offset = 0): Promise<Block[]> {
    return this.request(`/blocks?limit=${limit}&offset=${offset}`);
  }

  async getBlocksCursor(limit = 10, cursor?: number): Promise<CursorPage<Block>> {
    const cursorPart = cursor === undefined ? "" : `&cursor=${cursor}`;
    return this.request(`/blocks?limit=${limit}${cursorPart}`);
  }

  async getBlock(height: number): Promise<Block> {
    return this.request(`/blocks/${height}`);
  }

  async getTransactions(limit = 20, offset = 0): Promise<Transaction[]> {
    return this.request(`/transactions?limit=${limit}&offset=${offset}`);
  }

  async getTransactionsCursor(
    limit = 20,
    cursor?: string
  ): Promise<CursorPage<Transaction & { blockHeight: number; blockHash: string }>> {
    const cursorPart = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    return this.request(`/transactions?limit=${limit}${cursorPart}`);
  }

  async getTransaction(id: string): Promise<Transaction & { blockHeight: number; blockHash: string }> {
    return this.request(`/transactions/${encodeURIComponent(id)}`);
  }

  async search(query: string): Promise<SearchResponse> {
    return this.request(`/search?q=${encodeURIComponent(query)}`);
  }

  async getAddress(address: string): Promise<{
    address: string;
    balance: number;
    balances?: Record<string, number>;
    nonce: number;
    incomingTxs: number;
    outgoingTxs: number;
    chainId: string;
    headHeight: number;
    validator: Validator | null;
  }> {
    return this.request(`/address/${encodeURIComponent(address)}`);
  }

  async getAsset(assetId: string): Promise<AssetMetadata> {
    return this.request(`/assets/${encodeURIComponent(assetId)}`);
  }

  async getAssets(): Promise<AssetMetadata[]> {
    return this.request("/assets");
  }

  async getBalance(address: string, assetId = "ppl"): Promise<number> {
    const res = await this.request<{ balance: number; assetId: string }>(
      `/address/${encodeURIComponent(address)}/balances/${encodeURIComponent(assetId)}`
    );
    return res.balance;
  }

  async getAllBalances(address: string): Promise<Record<string, number>> {
    return this.request(`/address/${encodeURIComponent(address)}/balances`);
  }

  async getCommunityPool(assetId?: string): Promise<AssetPoolAccounting | Record<string, AssetPoolAccounting>> {
    const path = assetId ? `/community-pool/${encodeURIComponent(assetId)}` : "/community-pool";
    return this.request(path);
  }

  async getCurve(assetId: string): Promise<CurveState> {
    return this.request(`/assets/${encodeURIComponent(assetId)}/curve`);
  }

  async getCreatorVesting(assetId: string): Promise<CreatorVestingState> {
    return this.request(`/assets/${encodeURIComponent(assetId)}/vesting`);
  }

  async getLiquidityPool(poolId: string): Promise<LiquidityPoolState> {
    return this.request(`/liquidity-pools/${encodeURIComponent(poolId)}`);
  }

  async listLiquidityPools(): Promise<LiquidityPoolState[]> {
    return this.request("/liquidity-pools");
  }

  async quoteAmmSwap(options: {
    poolId: string;
    tokenIn: string;
    amountIn: number;
    tokenOut?: string;
  }): Promise<AmmQuote> {
    const params = new URLSearchParams({
      tokenIn: options.tokenIn,
      amountIn: String(options.amountIn)
    });
    if (options.tokenOut) {
      params.set("tokenOut", options.tokenOut);
    }
    return this.request(`/liquidity-pools/${encodeURIComponent(options.poolId)}/quote?${params.toString()}`);
  }

  async getTokenAllocation(assetId: string): Promise<TokenAllocation | undefined> {
    const asset = await this.getAsset(assetId);
    return asset.allocation;
  }

  async getAddressTransactions(
    address: string,
    limit = 50,
    offset = 0
  ): Promise<Array<Transaction & { blockHeight: number; blockHash: string }>> {
    return this.request(
      `/address/${encodeURIComponent(address)}/transactions?limit=${limit}&offset=${offset}`
    );
  }

  async getAddressTransactionsCursor(
    address: string,
    limit = 50,
    cursor?: string
  ): Promise<CursorPage<Transaction & { blockHeight: number; blockHash: string }>> {
    const cursorPart = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    return this.request(`/address/${encodeURIComponent(address)}/transactions?limit=${limit}${cursorPart}`);
  }

  async getAccounts(limit = 100, offset = 0): Promise<
    Array<{ address: string; balance: number; nonce: number; incomingTxs: number; outgoingTxs: number }>
  > {
    return this.request(`/accounts?limit=${limit}&offset=${offset}`);
  }

  async getValidators(): Promise<Validator[]> {
    return this.request("/validators");
  }

  async getProposals(): Promise<GovernanceProposal[]> {
    return this.request("/governance/proposals");
  }

  async submitTx(tx: Transaction): Promise<{ accepted: boolean; error?: string }> {
    return this.request("/tx", {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify(tx)
    });
  }

  async sendTransfer(
    privateKey: string,
    toOrOptions: string | SendTransferOptions,
    amount?: number,
    nonce?: number,
    fee = 0.1,
    memo?: string
  ) {
    const options: SendTransferOptions =
      typeof toOrOptions === "string"
        ? { to: toOrOptions, amount: amount ?? 0, nonce: nonce ?? 0, fee, memo }
        : toOrOptions;
    const trimmedMemo = options.memo?.trim();
    validateTransferMemo(trimmedMemo || undefined);
    const key = keyPairFromPrivateKey(privateKey);
    const tx = signTransaction(privateKey, {
      chainId: await this.resolveChainId(),
      id: `${key.address}-transfer-${Date.now()}`,
      from: key.address,
      to: options.to,
      amount: options.amount,
      fee: options.fee ?? DEFAULT_TRANSFER_FEE,
      nonce: options.nonce,
      timestamp: Date.now(),
      type: "transfer",
      ...(options.assetId ? { assetId: options.assetId } : {}),
      ...(trimmedMemo ? { payload: { memo: trimmedMemo } } : {})
    });
    return this.submitTx(tx);
  }

  async sendBatchTransfer(privateKey: string, options: SendBatchTransferOptions) {
    if (!Array.isArray(options.recipients) || options.recipients.length === 0) {
      throw new Error("Batch recipients required");
    }
    if (options.recipients.length > MAX_BATCH_RECIPIENTS) {
      throw new Error(`Too many recipients (max ${MAX_BATCH_RECIPIENTS})`);
    }
    const recipients: BatchRecipientInput[] = [];
    for (const item of options.recipients) {
      const to = item.to.trim();
      const amount = Number(item.amount);
      if (!to || !to.startsWith("0x")) {
        throw new Error("Invalid batch recipient address");
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Invalid batch recipient amount");
      }
      const trimmedMemo = item.memo?.trim();
      validateTransferMemo(trimmedMemo || undefined);
      recipients.push(trimmedMemo ? { to, amount, memo: trimmedMemo } : { to, amount });
    }
    const totalAmount = recipients.reduce((sum, item) => sum + item.amount, 0);
    const fee = options.fee ?? suggestedBatchFee(recipients.length);
    const key = keyPairFromPrivateKey(privateKey);
    const tx = signTransaction(privateKey, {
      chainId: await this.resolveChainId(),
      id: `${key.address}-batch-${Date.now()}`,
      from: key.address,
      to: "batch",
      amount: totalAmount,
      fee,
      nonce: options.nonce,
      timestamp: Date.now(),
      type: "transfer",
      payload: { recipients }
    });
    return this.submitTx(tx);
  }

  async fundFromFaucet(address: string, amount: number): Promise<{ ok: boolean; txId?: string }> {
    return this.request("/faucet/fund", {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({ address, amount })
    });
  }

  async joinValidator(
    privateKey: string,
    stake: number,
    nodeKind: "full" | "light",
    nonce = 0,
    referrer?: string
  ) {
    const key = keyPairFromPrivateKey(privateKey);
    const tx = signTransaction(privateKey, {
      chainId: await this.resolveChainId(),
      id: `${key.address}-join-${Date.now()}`,
      from: key.address,
      to: "staking_pool",
      amount: stake,
      fee: DEFAULT_TRANSFER_FEE,
      nonce,
      timestamp: Date.now(),
      type: "joinValidator",
      payload: { nodeKind, ...(referrer ? { referrer } : {}) }
    });
    return this.submitTx(tx);
  }

  async leaveValidator(privateKey: string, nonce: number) {
    const key = keyPairFromPrivateKey(privateKey);
    const tx = signTransaction(privateKey, {
      chainId: await this.resolveChainId(),
      id: `${key.address}-leave-${Date.now()}`,
      from: key.address,
      to: "staking_pool",
      amount: 0,
      fee: DEFAULT_TRANSFER_FEE,
      nonce,
      timestamp: Date.now(),
      type: "leaveValidator"
    });
    return this.submitTx(tx);
  }

  async unstake(privateKey: string, nonce: number) {
    const key = keyPairFromPrivateKey(privateKey);
    const tx = signTransaction(privateKey, {
      chainId: await this.resolveChainId(),
      id: `${key.address}-unstake-${Date.now()}`,
      from: key.address,
      to: "staking_pool",
      amount: 0,
      fee: DEFAULT_TRANSFER_FEE,
      nonce,
      timestamp: Date.now(),
      type: "unstake"
    });
    return this.submitTx(tx);
  }

  async submitProposal(
    privateKey: string,
    nonce: number,
    params: Partial<Pick<NetworkConfig, "minStake" | "epochBaseIssuance" | "lightValidatorWeightMultiplier">>
  ) {
    const key = keyPairFromPrivateKey(privateKey);
    const tx = signTransaction(privateKey, {
      chainId: await this.resolveChainId(),
      id: `${key.address}-proposal-${Date.now()}`,
      from: key.address,
      to: "governance",
      amount: 0,
      fee: DEFAULT_TRANSFER_FEE,
      nonce,
      timestamp: Date.now(),
      type: "proposal",
      payload: { params }
    });
    return this.submitTx(tx);
  }

  async vote(privateKey: string, nonce: number, proposalId: string, support: boolean) {
    const key = keyPairFromPrivateKey(privateKey);
    const tx = signTransaction(privateKey, {
      chainId: await this.resolveChainId(),
      id: `${key.address}-vote-${Date.now()}`,
      from: key.address,
      to: "governance",
      amount: 0,
      fee: 0.05,
      nonce,
      timestamp: Date.now(),
      type: "vote",
      payload: { proposalId, support }
    });
    return this.submitTx(tx);
  }

  async createToken(
    privateKey: string,
    options: {
      name: string;
      symbol: string;
      decimals?: number;
      totalSupply: number;
      metadata?: Record<string, unknown>;
      nonce: number;
      fee?: number;
    }
  ) {
    const key = keyPairFromPrivateKey(privateKey);
    const tx = signTransaction(privateKey, {
      chainId: await this.resolveChainId(),
      id: `${key.address}-tokenCreate-${Date.now()}`,
      from: key.address,
      to: "network",
      amount: 0,
      fee: options.fee ?? DEFAULT_TOKEN_CREATE_MIN_FEE,
      nonce: options.nonce,
      timestamp: Date.now(),
      type: "tokenCreate",
      payload: {
        name: options.name,
        symbol: options.symbol,
        decimals: options.decimals ?? 6,
        totalSupply: options.totalSupply,
        metadata: options.metadata
      }
    });
    return this.submitTx(tx);
  }

  async buyCurveTokens(
    privateKey: string,
    options: {
      assetId: string;
      nativeAmount: number;
      minTokensOut?: number;
      nonce: number;
      fee?: number;
    }
  ) {
    const key = keyPairFromPrivateKey(privateKey);
    const tx = signTransaction(privateKey, {
      chainId: await this.resolveChainId(),
      id: `${key.address}-curveBuy-${Date.now()}`,
      from: key.address,
      to: "curve",
      amount: options.nativeAmount,
      fee: options.fee ?? DEFAULT_TRANSFER_FEE,
      nonce: options.nonce,
      timestamp: Date.now(),
      type: "curveBuy",
      assetId: options.assetId,
      payload: {
        assetId: options.assetId,
        nativeAmount: options.nativeAmount,
        minTokensOut: options.minTokensOut ?? 0
      }
    });
    return this.submitTx(tx);
  }

  async sellCurveTokens(
    privateKey: string,
    options: {
      assetId: string;
      tokenAmount: number;
      minNativeOut?: number;
      nonce: number;
      fee?: number;
    }
  ) {
    const key = keyPairFromPrivateKey(privateKey);
    const tx = signTransaction(privateKey, {
      chainId: await this.resolveChainId(),
      id: `${key.address}-curveSell-${Date.now()}`,
      from: key.address,
      to: "curve",
      amount: options.tokenAmount,
      fee: options.fee ?? DEFAULT_TRANSFER_FEE,
      nonce: options.nonce,
      timestamp: Date.now(),
      type: "curveSell",
      assetId: options.assetId,
      payload: {
        assetId: options.assetId,
        tokenAmount: options.tokenAmount,
        minNativeOut: options.minNativeOut ?? 0
      }
    });
    return this.submitTx(tx);
  }

  async claimVestedTokens(
    privateKey: string,
    options: {
      assetId: string;
      nonce: number;
      fee?: number;
    }
  ) {
    const key = keyPairFromPrivateKey(privateKey);
    const tx = signTransaction(privateKey, {
      chainId: await this.resolveChainId(),
      id: `${key.address}-creatorClaim-${Date.now()}`,
      from: key.address,
      to: "vesting",
      amount: 0,
      fee: options.fee ?? DEFAULT_TRANSFER_FEE,
      nonce: options.nonce,
      timestamp: Date.now(),
      type: "creatorClaim",
      assetId: options.assetId,
      payload: {
        assetId: options.assetId
      }
    });
    return this.submitTx(tx);
  }

  async mintNft(
    privateKey: string,
    options: {
      name: string;
      description?: string;
      imageUri: string;
      collectionId?: string;
      nftId?: string;
      nonce: number;
      fee?: number;
    }
  ) {
    const key = keyPairFromPrivateKey(privateKey);
    const tx = signTransaction(privateKey, {
      chainId: await this.resolveChainId(),
      id: `${key.address}-nftMint-${Date.now()}`,
      from: key.address,
      to: "nft",
      amount: 0,
      fee: options.fee ?? DEFAULT_NFT_MINT_MIN_FEE,
      nonce: options.nonce,
      timestamp: Date.now(),
      type: "nftMint",
      payload: {
        name: options.name,
        description: options.description ?? "",
        imageUri: options.imageUri,
        ...(options.collectionId ? { collectionId: options.collectionId } : {}),
        ...(options.nftId ? { nftId: options.nftId } : {})
      }
    });
    return this.submitTx(tx);
  }

  async transferNft(
    privateKey: string,
    options: {
      nftId: string;
      to: string;
      nonce: number;
      fee?: number;
    }
  ) {
    const key = keyPairFromPrivateKey(privateKey);
    const tx = signTransaction(privateKey, {
      chainId: await this.resolveChainId(),
      id: `${key.address}-nftTransfer-${Date.now()}`,
      from: key.address,
      to: options.to,
      amount: 0,
      fee: options.fee ?? 0,
      nonce: options.nonce,
      timestamp: Date.now(),
      type: "nftTransfer",
      payload: { nftId: options.nftId }
    });
    return this.submitTx(tx);
  }

  async createAmmPool(
    privateKey: string,
    options: {
      tokenAssetId: string;
      tokenAmount: number;
      nativeAmount: number;
      minLpOut?: number;
      nonce: number;
      fee?: number;
    }
  ) {
    const key = keyPairFromPrivateKey(privateKey);
    const tx = signTransaction(privateKey, {
      chainId: await this.resolveChainId(),
      id: `${key.address}-ammCreatePool-${Date.now()}`,
      from: key.address,
      to: "amm",
      amount: options.nativeAmount,
      fee: options.fee ?? DEFAULT_TRANSFER_FEE,
      nonce: options.nonce,
      timestamp: Date.now(),
      type: "ammCreatePool",
      payload: {
        tokenAssetId: options.tokenAssetId,
        tokenAmount: options.tokenAmount,
        nativeAmount: options.nativeAmount,
        minLpOut: options.minLpOut ?? 0
      }
    });
    return this.submitTx(tx);
  }

  async addAmmLiquidity(
    privateKey: string,
    options: {
      tokenAssetId: string;
      tokenAmount: number;
      nativeAmount: number;
      poolId?: string;
      minLpOut?: number;
      nonce: number;
      fee?: number;
    }
  ) {
    const key = keyPairFromPrivateKey(privateKey);
    const tx = signTransaction(privateKey, {
      chainId: await this.resolveChainId(),
      id: `${key.address}-ammAddLiquidity-${Date.now()}`,
      from: key.address,
      to: "amm",
      amount: options.nativeAmount,
      fee: options.fee ?? DEFAULT_TRANSFER_FEE,
      nonce: options.nonce,
      timestamp: Date.now(),
      type: "ammAddLiquidity",
      payload: {
        tokenAssetId: options.tokenAssetId,
        tokenAmount: options.tokenAmount,
        nativeAmount: options.nativeAmount,
        minLpOut: options.minLpOut ?? 0,
        ...(options.poolId ? { poolId: options.poolId } : {})
      }
    });
    return this.submitTx(tx);
  }

  async removeAmmLiquidity(
    privateKey: string,
    options: {
      tokenAssetId: string;
      lpAmount: number;
      poolId?: string;
      minTokenOut?: number;
      minNativeOut?: number;
      nonce: number;
      fee?: number;
    }
  ) {
    const key = keyPairFromPrivateKey(privateKey);
    const tx = signTransaction(privateKey, {
      chainId: await this.resolveChainId(),
      id: `${key.address}-ammRemoveLiquidity-${Date.now()}`,
      from: key.address,
      to: "amm",
      amount: options.lpAmount,
      fee: options.fee ?? DEFAULT_TRANSFER_FEE,
      nonce: options.nonce,
      timestamp: Date.now(),
      type: "ammRemoveLiquidity",
      payload: {
        tokenAssetId: options.tokenAssetId,
        lpAmount: options.lpAmount,
        minTokenOut: options.minTokenOut ?? 0,
        minNativeOut: options.minNativeOut ?? 0,
        ...(options.poolId ? { poolId: options.poolId } : {})
      }
    });
    return this.submitTx(tx);
  }

  async swapAmm(
    privateKey: string,
    options: {
      tokenAssetId: string;
      tokenIn: string;
      tokenOut: string;
      amountIn: number;
      minAmountOut: number;
      poolId?: string;
      nonce: number;
      fee?: number;
    }
  ) {
    const key = keyPairFromPrivateKey(privateKey);
    const tx = signTransaction(privateKey, {
      chainId: await this.resolveChainId(),
      id: `${key.address}-ammSwap-${Date.now()}`,
      from: key.address,
      to: "amm",
      amount: options.amountIn,
      fee: options.fee ?? DEFAULT_TRANSFER_FEE,
      nonce: options.nonce,
      timestamp: Date.now(),
      type: "ammSwap",
      payload: {
        tokenAssetId: options.tokenAssetId,
        tokenIn: options.tokenIn,
        tokenOut: options.tokenOut,
        amountIn: options.amountIn,
        minAmountOut: options.minAmountOut,
        ...(options.poolId ? { poolId: options.poolId } : {})
      }
    });
    return this.submitTx(tx);
  }

  async deployContract(
    privateKey: string,
    options: {
      bytecode: string;
      constructorArgs?: string;
      nonce: number;
      fee: number;
      gasLimit?: number;
      value?: number;
      source?: Record<string, unknown>;
    }
  ) {
    const key = keyPairFromPrivateKey(privateKey);
    const tx = signTransaction(privateKey, {
      chainId: await this.resolveChainId(),
      id: `${key.address}-contractDeploy-${Date.now()}`,
      from: key.address,
      to: "0x0000000000000000000000000000000000000000",
      amount: options.value ?? 0,
      fee: options.fee,
      nonce: options.nonce,
      timestamp: Date.now(),
      type: "contractDeploy",
      payload: {
        bytecode: options.bytecode,
        gasLimit: options.gasLimit ?? DEFAULT_TX_GAS_LIMIT,
        ...(options.constructorArgs ? { constructorArgs: options.constructorArgs } : {}),
        ...(options.source ? { source: options.source } : {})
      }
    });
    return this.submitTx(tx);
  }

  async callContract(
    privateKey: string,
    options: {
      to: string;
      data: string;
      nonce: number;
      fee: number;
      gasLimit?: number;
      value?: number;
    }
  ) {
    const key = keyPairFromPrivateKey(privateKey);
    const tx = signTransaction(privateKey, {
      chainId: await this.resolveChainId(),
      id: `${key.address}-contractCall-${Date.now()}`,
      from: key.address,
      to: options.to,
      amount: options.value ?? 0,
      fee: options.fee,
      nonce: options.nonce,
      timestamp: Date.now(),
      type: "contractCall",
      payload: {
        data: options.data,
        gasLimit: options.gasLimit ?? DEFAULT_TX_GAS_LIMIT
      }
    });
    return this.submitTx(tx);
  }

  async getContract(address: string) {
    return this.request(`/contracts/${encodeURIComponent(address)}`);
  }

  async listContracts() {
    return this.request("/contracts");
  }

  async ethCall(body: { from?: string; to: string; data?: string; gasLimit?: number }) {
    return this.request("/contracts/call", {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify(body)
    });
  }

  async getNft(nftId: string): Promise<NftRecord> {
    return this.request(`/nfts/${encodeURIComponent(nftId)}`);
  }

  async listNfts(owner?: string): Promise<NftRecord[]> {
    const query = owner ? `?owner=${encodeURIComponent(owner)}` : "";
    return this.request(`/nfts${query}`);
  }

  async reportSecurity(validator: string, evidence: SlashEvidence): Promise<{ ok: boolean }> {
    return this.request("/security/report", {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({ validator, evidence, evidenceType: evidence.type })
    });
  }

  async getRewards(): Promise<RewardDistribution | null> {
    return this.request("/rewards/latest");
  }

  async getRewardHistory(limit = 50): Promise<RewardDistribution[]> {
    return this.request(`/rewards/history?limit=${limit}`);
  }

  async getJoinBundle(address: string, kind: "full" | "light"): Promise<{ qrPayload: string }> {
    return this.request("/bootstrap", {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({ address, kind })
    });
  }
}
