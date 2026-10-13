import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeService } from "./node-service.js";

describe("NodeService integration scenarios", () => {
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

  test("health details expose lag fields", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "ovn-api-int-"));
    node = new NodeService({
      dataDir,
      peerId: "integration-health",
      gossipPort: 20991,
      bootstrapPeers: [],
      blockIntervalMs: 60_000
    });
    await node.start();
    const details = node.getHealthDetails();
    expect(details.ok).toBe(true);
    expect(details.height).toBeGreaterThanOrEqual(0);
    expect(details.finalizedLag).toBeGreaterThanOrEqual(0);
  });

  test("metrics increment rejected tx counter", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "ovn-api-int-"));
    node = new NodeService({
      dataDir,
      peerId: "integration-reject",
      gossipPort: 20992,
      bootstrapPeers: [],
      blockIntervalMs: 60_000
    });
    await node.start();
    const invalidTx = {
      id: "bad-tx",
      from: "0x0",
      to: "0x1",
      amount: 1,
      fee: 0.1,
      nonce: 0,
      timestamp: Date.now(),
      type: "transfer" as const
    };
    const result = node.submitTransaction(invalidTx);
    expect(result.accepted).toBe(false);
    expect(node.getMetrics().rejectedTxCount).toBeGreaterThan(0);
  });

  test("NodeService exposes Phase 2 curve, vesting, and liquidity endpoints", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "ovn-api-phase2-"));
    node = new NodeService({
      dataDir,
      peerId: "integration-phase2",
      gossipPort: 20993,
      bootstrapPeers: [],
      blockIntervalMs: 60_000
    });
    await node.start();

    // Query non-existent curve
    expect(node.getCurve("nonexistent")).toBeUndefined();
    expect(node.getCreatorVesting("nonexistent")).toBeUndefined();
    expect(node.getLiquidityPool("nonexistent")).toBeUndefined();
    expect(node.getNft("nft-missing")).toBeUndefined();
    expect(node.listNfts()).toEqual([]);

    const liq = node.getAssetLiquidity("nonexistent");
    expect(liq.liquidityReserve).toBe(0);
    expect(liq.ecosystemReserve).toBe(0);
    expect(liq.launchReserve).toBe(0);
  });

  test("testnet faucet is gated by ALLOW_FAUCET and not by debug endpoints", async () => {
    const prevFaucet = process.env.ALLOW_FAUCET;
    const prevEnv = process.env.NODE_ENV;
    process.env.ALLOW_FAUCET = "1";
    process.env.NODE_ENV = "production";
    dataDir = await mkdtemp(join(tmpdir(), "ovn-api-faucet-"));
    node = new NodeService({
      dataDir,
      peerId: "integration-faucet",
      gossipPort: 20994,
      bootstrapPeers: [],
      blockIntervalMs: 60_000
    });
    await node.start();
    expect(node.isPublicFaucetEnabled()).toBe(true);
    const { generateKeyPair } = await import("@ovn/core");
    const user = generateKeyPair();
    try {
      const tx = node.fundFromFaucet(user.address, 1);
      expect(tx.from).toBeTruthy();
      expect(node.chainState.mempool.some((item) => item.id === tx.id)).toBe(true);
    } finally {
      if (prevFaucet === undefined) delete process.env.ALLOW_FAUCET;
      else process.env.ALLOW_FAUCET = prevFaucet;
      if (prevEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevEnv;
    }
  });
});
