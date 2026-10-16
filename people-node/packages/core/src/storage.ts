import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Level } from "level";
import type { Block, RewardDistribution, Transaction } from "@ovn/protocol";
import {
  CHECKPOINT_INTERVAL,
  CHECKPOINT_KEEP,
  CHAIN_WINDOW_BLOCKS,
  NATIVE_ASSET,
  NATIVE_ASSET_ID,
  compactChainStateForCheckpoint,
  isValidAssetId,
  migrateLegacyNativeAssetState,
  normalizeAttestationVotes,
  trimChainWindow,
  type ChainState
} from "./index.js";

export interface PersistedSnapshot {
  chainState: ChainState;
  feePool: number;
  latestReward: RewardDistribution | null;
  totalValidatorRewards?: number;
  totalTransactions?: number;
  rewardHistory?: RewardDistribution[];
}

/**
 * M10-3: the last block this node signed, written to disk before the block is published.
 * A node that dies between proposing and persisting its snapshot would otherwise come back
 * one block behind and sign a *different* block at the same height — equivocation that the
 * network slashes for. This record tells the restart what it already signed.
 */
export interface SigningRecord {
  height: number;
  hash: string;
}

/**
 * M04-1: refuse to load a snapshot whose balances cannot be replayed
 * deterministically. Inherited keys (`constructor`, `__proto__`) and non-finite
 * or negative amounts are never produced by a current node; if they are present
 * the data has to be migrated by the owner, not silently repaired here.
 */
export function assertLoadableBalances(accounts: Record<string, { balance?: number; balances?: Record<string, number> }>): void {
  for (const [address, account] of Object.entries(accounts ?? {})) {
    const amounts: Array<[string, unknown]> = [[NATIVE_ASSET_ID, account.balance]];
    for (const [assetId, amount] of Object.entries(account.balances ?? {})) {
      if (!isValidAssetId(assetId)) {
        throw new Error(
          `Persisted snapshot has an unusable balance key "${assetId}" on account ${address}; ` +
            "refusing to load (M04-1). Migrating this record is an owner decision."
        );
      }
      amounts.push([assetId, amount]);
    }
    for (const [assetId, amount] of amounts) {
      if (amount === undefined) continue;
      if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
        throw new Error(
          `Persisted snapshot has a non-numeric balance for ${assetId} on account ${address}; ` +
            "refusing to load (M04-1). Migrating this record is an owner decision."
        );
      }
    }
  }
}

export class ChainStore {
  private readonly db: Level<string, string>;
  private lastPersistedHeadHeight = -1;
  private readonly addrTxCache = new Map<string, string[]>();

  constructor(private readonly dbPath: string, private readonly archive = false) {
    this.db = new Level<string, string>(dbPath, { valueEncoding: "utf8" });
  }

  async open(): Promise<void> {
    await mkdir(dirname(this.dbPath), { recursive: true });
    await this.db.open();
    try {
      const raw = await this.db.get("meta:head");
      const height = raw === undefined ? -1 : Number(raw);
      if (!Number.isSafeInteger(height)) throw new Error("Invalid persisted head");
      this.lastPersistedHeadHeight = height;
    } catch (error) {
      if ((error as {code?:string})?.code !== "LEVEL_NOT_FOUND") throw error;
      this.lastPersistedHeadHeight = -1;
    }
  }

  async load(): Promise<PersistedSnapshot | null> {
    try {
      const raw = await this.db.get("snapshot");
      if (raw === undefined) {
        if (this.lastPersistedHeadHeight >= 0) throw new Error("Snapshot missing from non-empty chain database");
        return null;
      }
      const snapshot = JSON.parse(raw) as PersistedSnapshot;
      if (!snapshot?.chainState?.chain?.length) throw new Error("Invalid persisted snapshot");
      migrateLegacyNativeAssetState(snapshot.chainState);
      snapshot.chainState.proposals ??= {};
      snapshot.chainState.attestationVotes ??= {};
      snapshot.chainState.attestationBallots ??= {};
      snapshot.chainState.finalizedHeight ??= 0;
      snapshot.chainState.seenBlockHashes ??= {};
      snapshot.chainState.missedProposalCount ??= 0;
      snapshot.rewardHistory ??= [];
      snapshot.chainState.assets ??= { [NATIVE_ASSET_ID]: { ...NATIVE_ASSET } };
      snapshot.chainState.communityPool ??= { pools: {} };
      snapshot.chainState.treasury ??= { [NATIVE_ASSET_ID]: 0 };
      snapshot.chainState.burned ??= { [NATIVE_ASSET_ID]: 0 };
      snapshot.chainState.curves ??= {};
      snapshot.chainState.vesting ??= {};
      snapshot.chainState.liquidityReserves ??= {};
      snapshot.chainState.ecosystemReserves ??= {};
      snapshot.chainState.launchReserves ??= {};
      snapshot.chainState.participants ??= {};
      snapshot.chainState.contributionEpochs ??= {};
      snapshot.chainState.networkActivityEpochs ??= {};
      snapshot.chainState.growthPool ??= { totalInflow: 0, totalReturned: 0, claimedSettled: 0, escrow: 0 };
      snapshot.chainState.growthEpochInflow ??= {};
      snapshot.chainState.growthEpochBudget ??= {};
      snapshot.chainState.growthAssigned ??= {};
      snapshot.chainState.growthClaims ??= {};
      snapshot.chainState.growthSettledEpochs ??= {};
      snapshot.chainState.feeLiquidityEcosystem ??= 0;
      snapshot.chainState.liquidityPools ??= {};
      snapshot.chainState.nfts ??= {};
      snapshot.chainState.contracts ??= {};
      snapshot.chainState.contractReceipts ??= {};
      snapshot.chainState.contractMeta ??= {};
      // Absent on every snapshot written before the promo share existed. An empty map is not
      // hashed, so defaulting it here cannot change a persisted state root.
      snapshot.chainState.promoPools ??= {};
      assertLoadableBalances(snapshot.chainState.accounts);
      for (const account of Object.values(snapshot.chainState.accounts)) {
        account.balances ??= { [NATIVE_ASSET_ID]: account.balance ?? 0 };
        account.balance ??= account.balances[NATIVE_ASSET_ID] ?? 0;
      }
      for (const validator of Object.values(snapshot.chainState.validators)) {
        validator.joinedAtEpoch ??= 0;
      }
      normalizeAttestationVotes(snapshot.chainState);
      trimChainWindow(snapshot.chainState, CHAIN_WINDOW_BLOCKS);
      const head = snapshot.chainState.chain[snapshot.chainState.chain.length - 1];
      if (head) {
        this.lastPersistedHeadHeight = head.header.height;
      }
      return snapshot;
    } catch (error) {
      if ((error as {code?:string})?.code === "LEVEL_NOT_FOUND") return null;
      throw new Error("Cannot load persisted chain; refusing to replace it with genesis", {cause:error});
    }
  }

  async save(snapshot: PersistedSnapshot): Promise<void> {
    // Persist a trimmed copy so snapshot JSON stays bounded.
    snapshot = structuredClone(snapshot);
    trimChainWindow(snapshot.chainState, CHAIN_WINDOW_BLOCKS);

    const ops: Array<{ type: "put"; key: string; value: string }> = [
      { type: "put", key: "snapshot", value: JSON.stringify(snapshot) }
    ];

    const chain = snapshot.chainState.chain;
    const head = chain[chain.length - 1];
    for (const head of chain.filter(block => block.header.height > this.lastPersistedHeadHeight)) {
      ops.push({ type: "put", key: `block:${head.header.height}`, value: JSON.stringify(head) });
      ops.push({ type: "put", key: `blockhash:${head.hash}`, value: String(head.header.height) });

      for (const tx of head.transactions) {
        ops.push({
          type: "put",
          key: `tx:${tx.id}`,
          value: JSON.stringify({ ...tx, blockHeight: head.header.height, blockHash: head.hash })
        });
        const related = new Set<string>([tx.from, tx.to]);
        const recipients = tx.payload?.recipients;
        if (Array.isArray(recipients)) {
          for (const item of recipients) {
            if (item && typeof item === "object" && typeof (item as { to?: unknown }).to === "string") {
              related.add(String((item as { to: string }).to));
            }
          }
        }
        for (const address of related) {
          const key = `addr:${address.toLowerCase()}:txs`;
          let list = this.addrTxCache.get(key);
          if (!list) {
            try {
              list = JSON.parse(await this.db.get(key)) as string[];
            } catch {
              list = [];
            }
            this.addrTxCache.set(key, list);
          }
          if (!list.includes(tx.id)) {
            list.push(tx.id);
            if (list.length > 500) {
              list = list.slice(-500);
              this.addrTxCache.set(key, list);
            }
            ops.push({ type: "put", key, value: JSON.stringify(list) });
          }
        }
      }

      if (head === chain[chain.length - 1] && head.header.height > 0 && head.header.height % CHECKPOINT_INTERVAL === 0) {
        ops.push({
          type: "put",
          key: `checkpoint:${head.header.height}`,
          value: JSON.stringify({
            height: head.header.height,
            hash: head.hash,
            chainState: compactChainStateForCheckpoint(snapshot.chainState)
          })
        });
      }

      ops.push({ type: "put", key: "meta:head", value: String(head.header.height) });
    }

    ops.push({ type: "put", key: "meta:epoch", value: String(snapshot.chainState.epoch) });
    try {
      await this.db.batch(ops);
      if (head) this.lastPersistedHeadHeight = head.header.height;
    } catch (error) { this.addrTxCache.clear(); throw error; }
  }

  async getCheckpoint(height: number): Promise<{ height: number; hash: string; chainState: ChainState } | null> {
    try {
      const parsed = JSON.parse(await this.db.get(`checkpoint:${height}`)) as {
        height: number;
        hash: string;
        chainState: ChainState;
      };
      migrateLegacyNativeAssetState(parsed.chainState);
      parsed.chainState.attestationVotes ??= {};
      parsed.chainState.attestationBallots ??= {};
      parsed.chainState.seenBlockHashes ??= {};
      parsed.chainState.mempool ??= [];
      parsed.chainState.assets ??= { [NATIVE_ASSET_ID]: { ...NATIVE_ASSET } };
      parsed.chainState.communityPool ??= { pools: {} };
      parsed.chainState.treasury ??= { [NATIVE_ASSET_ID]: 0 };
      parsed.chainState.burned ??= { [NATIVE_ASSET_ID]: 0 };
      parsed.chainState.curves ??= {};
      parsed.chainState.vesting ??= {};
      parsed.chainState.liquidityReserves ??= {};
      parsed.chainState.ecosystemReserves ??= {};
      parsed.chainState.launchReserves ??= {};
      parsed.chainState.participants ??= {};
      parsed.chainState.contributionEpochs ??= {};
      parsed.chainState.networkActivityEpochs ??= {};
      parsed.chainState.growthPool ??= { totalInflow: 0, totalReturned: 0, claimedSettled: 0, escrow: 0 };
      parsed.chainState.growthEpochInflow ??= {};
      parsed.chainState.growthEpochBudget ??= {};
      parsed.chainState.growthAssigned ??= {};
      parsed.chainState.growthClaims ??= {};
      parsed.chainState.growthSettledEpochs ??= {};
      parsed.chainState.feeLiquidityEcosystem ??= 0;
      parsed.chainState.liquidityPools ??= {};
      parsed.chainState.nfts ??= {};
      parsed.chainState.contracts ??= {};
      parsed.chainState.contractReceipts ??= {};
      parsed.chainState.contractMeta ??= {};
      // Absent on every snapshot written before the promo share existed. An empty map is not
      // hashed, so defaulting it here cannot change a persisted state root.
      parsed.chainState.promoPools ??= {};
      assertLoadableBalances(parsed.chainState.accounts ?? {});
      for (const account of Object.values(parsed.chainState.accounts ?? {})) {
        account.balances ??= { [NATIVE_ASSET_ID]: account.balance ?? 0 };
        account.balance ??= account.balances[NATIVE_ASSET_ID] ?? 0;
      }
      normalizeAttestationVotes(parsed.chainState);
      return parsed;
    } catch {
      return null;
    }
  }

  async getNearestCheckpoint(beforeHeight: number): Promise<{ height: number; hash: string; chainState: ChainState } | null> {
    const aligned = Math.floor(beforeHeight / CHECKPOINT_INTERVAL) * CHECKPOINT_INTERVAL;
    for (let height = aligned; height >= CHECKPOINT_INTERVAL; height -= CHECKPOINT_INTERVAL) {
      const checkpoint = await this.getCheckpoint(height);
      if (checkpoint) {
        return checkpoint;
      }
    }
    return null;
  }

  /** Persist each validated block before it can fall out of the in-memory window. */
  async archiveBlock(block: Block): Promise<void> {
    if (this.archive) await this.db.put(`block:${block.header.height}`, JSON.stringify(block));
  }

  /** Written before publish, never pruned: it is the node's equivocation guard (M10-3). */
  async saveSigningRecord(record: SigningRecord): Promise<void> {
    await this.db.put("signing:last", JSON.stringify(record));
  }

  async loadSigningRecord(): Promise<SigningRecord | null> {
    try {
      const parsed = JSON.parse(await this.db.get("signing:last")) as SigningRecord;
      if (!Number.isSafeInteger(parsed?.height) || parsed.height < 0 || typeof parsed?.hash !== "string") {
        return null;
      }
      return { height: parsed.height, hash: parsed.hash };
    } catch {
      return null;
    }
  }

  async assertArchiveComplete(head: Block): Promise<void> {
    if (!this.archive) return;
    let previousHash = "GENESIS";
    for (let height = 0; height <= head.header.height; height++) {
      const block = await this.getBlock(height);
      if (!block || block.header.height !== height || block.header.previousHash !== previousHash) {
        throw new Error(`Archive history missing or inconsistent at height ${height}; existing data preserved`);
      }
      previousHash = block.hash;
    }
    if (previousHash !== head.hash) throw new Error("Archive head mismatch");
  }

  async getBlock(height: number): Promise<Block | null> {
    try {
      return JSON.parse(await this.db.get(`block:${height}`)) as Block;
    } catch {
      return null;
    }
  }

  async getTransaction(id: string): Promise<(Transaction & { blockHeight: number; blockHash: string }) | null> {
    try {
      return JSON.parse(await this.db.get(`tx:${id}`)) as Transaction & { blockHeight: number; blockHash: string };
    } catch {
      return null;
    }
  }

  /**
   * Delete ancient block/tx/checkpoint keys below `height`.
   * Keeps the newest CHECKPOINT_KEEP checkpoints even if older than the window.
   */
  async pruneBefore(height: number): Promise<{ deleted: number }> {
    if (this.archive) throw new Error("Pruning is disabled in archive mode");
    const ops: Array<{ type: "del"; key: string }> = [];
    const checkpointHeights: number[] = [];

    for await (const key of this.db.keys()) {
      if (key.startsWith("block:")) {
        const blockHeight = Number(key.slice("block:".length));
        if (!Number.isNaN(blockHeight) && blockHeight < height && blockHeight > 0) {
          ops.push({ type: "del", key });
        }
        continue;
      }
      if (key.startsWith("checkpoint:")) {
        const cpHeight = Number(key.slice("checkpoint:".length));
        if (!Number.isNaN(cpHeight)) {
          checkpointHeights.push(cpHeight);
        }
        continue;
      }
      if (key.startsWith("tx:")) {
        try {
          const raw = await this.db.get(key);
          const tx = JSON.parse(raw) as { blockHeight?: number };
          if (typeof tx.blockHeight === "number" && tx.blockHeight < height && tx.blockHeight > 0) {
            ops.push({ type: "del", key });
          }
        } catch {
          // ignore unreadable tx rows
        }
      }
    }

    checkpointHeights.sort((a, b) => b - a);
    const keepCheckpoints = new Set(checkpointHeights.slice(0, Math.max(1, CHECKPOINT_KEEP)));
    for (const cpHeight of checkpointHeights) {
      if (cpHeight < height && !keepCheckpoints.has(cpHeight)) {
        ops.push({ type: "del", key: `checkpoint:${cpHeight}` });
      }
    }

    // Drop stale blockhash index entries for pruned heights when possible.
    for await (const key of this.db.keys()) {
      if (!key.startsWith("blockhash:")) {
        continue;
      }
      try {
        const h = Number(await this.db.get(key));
        if (!Number.isNaN(h) && h < height && h > 0) {
          ops.push({ type: "del", key });
        }
      } catch {
        // ignore
      }
    }

    if (ops.length > 0) {
      // Level batch has practical size limits; chunk deletes.
      const chunkSize = 500;
      for (let i = 0; i < ops.length; i += chunkSize) {
        await this.db.batch(ops.slice(i, i + chunkSize));
      }
    }
    return { deleted: ops.length };
  }

  async close(): Promise<void> {
    this.addrTxCache.clear();
    await this.db.close();
  }
}
