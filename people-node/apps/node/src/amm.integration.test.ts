import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_TRANSFER_FEE,
  NATIVE_ASSET_ID,
  applyTransaction,
  ensureAccount,
  generateKeyPair,
  nativeLiquidityPoolId,
  registerAsset,
  setAccountBalance,
  signTransaction
} from "@ovn/core";
import { NodeService } from "./node-service.js";

describe("NodeService AMM v0.1", () => {
  let dataDir = "";
  let node: NodeService | null = null;

  afterEach(async () => {
    if (node) {
      await node.stop();
      node = null;
    }
    if (dataDir) {
      await rm(dataDir, { recursive: true, force: true });
      dataDir = "";
    }
  });

  test("lists pools, quotes swaps, and accepts AMM txs on the existing submit path", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "ovn-amm-int-"));
    node = new NodeService({
      dataDir,
      peerId: "integration-amm",
      gossipPort: 20995,
      bootstrapPeers: [],
      blockIntervalMs: 60_000
    });
    await node.start();

    expect(node.listLiquidityPools()).toEqual([]);
    expect(node.getLiquidityPool("pool-ppl-gold")).toBeUndefined();

    const user = generateKeyPair();
    const account = ensureAccount(node.chainState, user.address);
    account.balance = 1_000_000;
    account.balances[NATIVE_ASSET_ID] = 1_000_000;
    registerAsset(node.chainState, {
      assetId: "gold",
      type: "user",
      name: "Gold",
      symbol: "GOLD",
      decimals: 6,
      totalSupply: 1_000_000,
      creator: user.address,
      status: "active"
    });
    setAccountBalance(account, "gold", 400_000);

    const chainId = node.getChainConfig().chainId;
    const createTx = signTransaction(user.privateKey, {
      chainId,
      id: `${user.address}-ammCreatePool-0`,
      from: user.address,
      to: "amm",
      amount: 80_000,
      fee: DEFAULT_TRANSFER_FEE,
      nonce: 0,
      timestamp: Date.now(),
      type: "ammCreatePool",
      payload: { tokenAssetId: "gold", tokenAmount: 160_000, nativeAmount: 80_000 }
    });
    applyTransaction(node.chainState, createTx, node.getChainConfig());

    const pools = node.listLiquidityPools();
    expect(pools).toHaveLength(1);
    expect(pools[0]?.tokenAssetId).toBe("gold");
    const poolId = nativeLiquidityPoolId("gold");
    expect(node.getLiquidityPool(poolId)?.nativeReserve).toBe(80_000);

    const quote = node.quoteAmmSwap(poolId, NATIVE_ASSET_ID, 1_000, "gold");
    expect(quote.amountOut).toBeGreaterThan(0);
    expect(quote.feeBps).toBe(30);
    expect(quote.lpFee).toBeGreaterThan(0);

    const swapTx = signTransaction(user.privateKey, {
      chainId,
      id: `${user.address}-ammSwap-mempool`,
      from: user.address,
      to: "amm",
      amount: 1_000,
      fee: DEFAULT_TRANSFER_FEE,
      nonce: 1,
      timestamp: Date.now(),
      type: "ammSwap",
      payload: {
        tokenAssetId: "gold",
        tokenIn: NATIVE_ASSET_ID,
        tokenOut: "gold",
        amountIn: 1_000,
        minAmountOut: quote.amountOut
      }
    });
    const submitted = node.submitTransaction(swapTx);
    expect(submitted.accepted).toBe(true);
    expect(node.chainState.mempool.some((tx) => tx.id === swapTx.id)).toBe(true);
  });
});
