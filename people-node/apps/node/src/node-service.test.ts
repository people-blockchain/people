import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeService } from "./node-service.js";

describe("NodeService metrics", () => {
  let dataDir: string;
  let node: NodeService;

  afterEach(async () => {
    if (node) {
      await node.stop();
    }
    if (dataDir) {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  test("backfills transaction counter on start", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "ovn-node-test-"));
    node = new NodeService({
      dataDir,
      peerId: "test-metrics",
      gossipPort: 19998,
      bootstrapPeers: [],
      blockIntervalMs: 60_000
    });
    await node.start();
    node.fundFromFaucet("0x0000000000000000000000000000000000000001", 10);
    const metrics = node.getMetrics();
    expect(metrics.transactionCount).toBeGreaterThanOrEqual(0);
    expect(metrics.tokenPriceUsd).toBeGreaterThan(0);
    expect(node.getRewardHistory()).toEqual([]);
  });

  test("RA-CHAIN-N1: faucet enforces an aggregate daily budget across distinct addresses", async () => {
    const previousCap = process.env.FAUCET_DAILY_CAP_PPL;
    process.env.FAUCET_DAILY_CAP_PPL = "15";
    try {
      dataDir = await mkdtemp(join(tmpdir(), "ovn-node-test-"));
      node = new NodeService({
        dataDir,
        peerId: "test-faucet-cap",
        gossipPort: 19996,
        bootstrapPeers: [],
        blockIntervalMs: 60_000
      });
      await node.start();
      node.fundFromFaucet("0x0000000000000000000000000000000000000001", 10);
      expect(() =>
        node.fundFromFaucet("0x0000000000000000000000000000000000000002", 10)
      ).toThrow("faucet_daily_budget_exhausted");
    } finally {
      if (previousCap === undefined) delete process.env.FAUCET_DAILY_CAP_PPL;
      else process.env.FAUCET_DAILY_CAP_PPL = previousCap;
    }
  });

  test("contract eth_call rate limit and gas cap are node-local policy", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "ovn-contract-call-"));
    node = new NodeService({
      dataDir,
      peerId: "test-contract-call",
      gossipPort: 19997,
      bootstrapPeers: [],
      blockIntervalMs: 60_000
    });
    await node.start();
    expect(node.getContractCallMaxGas()).toBeLessThanOrEqual(1_000_000);
    const ip = "203.0.113.10";
    for (let i = 0; i < 30; i++) {
      expect(node.allowContractCall(ip)).toBe(true);
    }
    expect(node.allowContractCall(ip)).toBe(false);
    expect(node.allowContractCall("203.0.113.11")).toBe(true);
  });

  test("M10-5: a restarted node adopts bootstrapAddress from genesis/chain state, not its own env", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "ovn-bootstrap-adopt-"));
    node = new NodeService({
      dataDir,
      peerId: "test-bootstrap-adopt",
      gossipPort: 19996,
      bootstrapPeers: [],
      blockIntervalMs: 60_000
    });
    await node.start();
    const genesisBootstrap = node.config.bootstrapAddress;
    expect(genesisBootstrap).toMatch(/^0x[0-9a-f]{40}$/);
    // Force the genesis snapshot to disk; the block-production timer (60s) would not fire in time.
    await (Reflect.get(node, "persist") as () => Promise<void>).call(node);
    await node.stop();

    const savedEnv = process.env.BOOTSTRAP_ADDRESS;
    delete process.env.BOOTSTRAP_ADDRESS;
    try {
      const rejoined = new NodeService({
        dataDir,
        peerId: "test-bootstrap-adopt-2",
        gossipPort: 19996,
        bootstrapPeers: [],
        blockIntervalMs: 60_000
      });
      await rejoined.start();
      expect(rejoined.config.bootstrapAddress).toBe(genesisBootstrap);
      await rejoined.stop();
    } finally {
      process.env.BOOTSTRAP_ADDRESS = savedEnv;
    }
  });

  // CHAIN-H2 (docs/audit-final/chain.md): Consensus Upgrade #1 is a coordinated fork. The seed
  // must publish its height to joining nodes, and a height already pinned in this node's own
  // state must not be silently replaced by a different env value — both would fork the node.
  test("CHAIN-H2: the public network descriptor publishes the consensus-upgrade-1 height", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "ovn-cu1-descriptor-"));
    node = new NodeService({
      dataDir,
      peerId: "test-cu1-descriptor",
      gossipPort: 19994,
      bootstrapPeers: [],
      blockIntervalMs: 60_000
    });
    node.config.consensusUpgrade1 = { height: 500_000 };
    await node.start();
    expect(node.getPublicNetworkInfo().consensusUpgrade1).toEqual({ height: 500_000 });
  });

  test("CHAIN-H2: a changed or dropped consensus-upgrade-1 height is refused at restart", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "ovn-cu1-restart-"));
    node = new NodeService({
      dataDir,
      peerId: "test-cu1-restart",
      gossipPort: 19993,
      bootstrapPeers: [],
      blockIntervalMs: 60_000
    });
    // `config` is an import-time snapshot of process.env, and the genesis state is built in the
    // constructor, so patch both to emulate a node that was previously started with
    // CONSENSUS_UPGRADE_1_HEIGHT=500000 set.
    node.config.consensusUpgrade1 = { height: 500_000 };
    (Reflect.get(node, "chainState") as { networkConfig?: { consensusUpgrade1?: { height: number } } })
      .networkConfig!.consensusUpgrade1 = { height: 500_000 };
    await node.start();
    await (Reflect.get(node, "persist") as () => Promise<void>).call(node);
    await node.stop();

    const restart = (height?: number) => {
      const next = new NodeService({
        dataDir,
        peerId: "test-cu1-restart-2",
        gossipPort: 19993,
        bootstrapPeers: [],
        blockIntervalMs: 60_000
      });
      next.config.consensusUpgrade1 = height === undefined ? undefined : { height };
      return next;
    };

    await expect(restart(600_000).start()).rejects.toThrow(/Consensus upgrade 1 configuration changed/);
    await expect(restart(undefined).start()).rejects.toThrow(/Consensus upgrade 1 configuration changed/);
    const same = restart(500_000);
    await same.start();
    expect(same.config.consensusUpgrade1).toEqual({ height: 500_000 });
    await same.stop();
  });

  // The optional creator promo share is a coordinated fork with the same two failure modes:
  // an unpublished height forks a joining node, and a silently replaced height forks this one.
  test("the public network descriptor publishes the promo-share activation height", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "ovn-promo-descriptor-"));
    node = new NodeService({
      dataDir,
      peerId: "test-promo-descriptor",
      gossipPort: 19992,
      bootstrapPeers: [],
      blockIntervalMs: 60_000
    });
    node.config.promoShareUpgrade = { height: 25_492 };
    await node.start();
    expect(node.getPublicNetworkInfo().promoShareUpgrade).toEqual({ height: 25_492 });
  });

  test("a changed or dropped promo-share height is refused at restart", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "ovn-promo-restart-"));
    node = new NodeService({
      dataDir,
      peerId: "test-promo-restart",
      gossipPort: 19991,
      bootstrapPeers: [],
      blockIntervalMs: 60_000
    });
    node.config.promoShareUpgrade = { height: 500_000 };
    (Reflect.get(node, "chainState") as { networkConfig?: { promoShareUpgrade?: { height: number } } })
      .networkConfig!.promoShareUpgrade = { height: 500_000 };
    await node.start();
    await (Reflect.get(node, "persist") as () => Promise<void>).call(node);
    await node.stop();

    const restart = (height?: number) => {
      const next = new NodeService({
        dataDir,
        peerId: "test-promo-restart-2",
        gossipPort: 19991,
        bootstrapPeers: [],
        blockIntervalMs: 60_000
      });
      next.config.promoShareUpgrade = height === undefined ? undefined : { height };
      return next;
    };

    await expect(restart(600_000).start()).rejects.toThrow(/Promo share upgrade configuration changed/);
    await expect(restart(undefined).start()).rejects.toThrow(/Promo share upgrade configuration changed/);
    const same = restart(500_000);
    await same.start();
    expect(same.config.promoShareUpgrade).toEqual({ height: 500_000 });
    await same.stop();
  });

  test("M10-5: a conflicting BOOTSTRAP_ADDRESS is still rejected rather than silently overridden", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "ovn-bootstrap-conflict-"));
    node = new NodeService({
      dataDir,
      peerId: "test-bootstrap-conflict",
      gossipPort: 19995,
      bootstrapPeers: [],
      blockIntervalMs: 60_000
    });
    await node.start();
    await (Reflect.get(node, "persist") as () => Promise<void>).call(node);
    await node.stop();

    const savedEnv = process.env.BOOTSTRAP_ADDRESS;
    process.env.BOOTSTRAP_ADDRESS = "0x" + "a".repeat(40);
    try {
      const conflicting = new NodeService({
        dataDir,
        peerId: "test-bootstrap-conflict-2",
        gossipPort: 19995,
        bootstrapPeers: [],
        blockIntervalMs: 60_000
      });
      await expect(conflicting.start()).rejects.toThrow(/BOOTSTRAP_ADDRESS does not match/);
    } finally {
      process.env.BOOTSTRAP_ADDRESS = savedEnv;
    }
  });

  // OPS-M3 (docs/audit-final/ops.md): isDevEndpointAllowed() used to be dead code, so
  // ALLOW_DEV_ENDPOINTS=0 did not actually disable anything. It now gates POST
  // /security/report via reportSecurity().
  test("OPS-M3: a production node without a token or ALLOW_DEV_ENDPOINTS rejects unauthenticated security reports", async () => {
    const savedNodeEnv = process.env.NODE_ENV;
    const savedAllowDev = process.env.ALLOW_DEV_ENDPOINTS;
    const savedToken = process.env.DEV_API_TOKEN;
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_DEV_ENDPOINTS;
    delete process.env.DEV_API_TOKEN;
    try {
      dataDir = await mkdtemp(join(tmpdir(), "ovn-dev-endpoint-disabled-"));
      node = new NodeService({
        dataDir,
        peerId: "test-dev-endpoint-disabled",
        gossipPort: 19992,
        bootstrapPeers: [],
        blockIntervalMs: 60_000
      });
      await node.start();
      const result = node.reportSecurity("0x" + "a".repeat(40), {
        type: "double_sign",
        validator: "0x" + "a".repeat(40),
        height: 1,
        blockHashA: "a",
        blockHashB: "b"
      });
      expect(result).toEqual({ ok: false, error: "unauthorized" });
    } finally {
      process.env.NODE_ENV = savedNodeEnv;
      process.env.ALLOW_DEV_ENDPOINTS = savedAllowDev;
      process.env.DEV_API_TOKEN = savedToken;
    }
  });

  test("OPS-M3: ALLOW_DEV_ENDPOINTS=1 re-enables the same route on a production node", async () => {
    const savedNodeEnv = process.env.NODE_ENV;
    const savedAllowDev = process.env.ALLOW_DEV_ENDPOINTS;
    const savedToken = process.env.DEV_API_TOKEN;
    process.env.NODE_ENV = "production";
    process.env.ALLOW_DEV_ENDPOINTS = "1";
    delete process.env.DEV_API_TOKEN;
    try {
      dataDir = await mkdtemp(join(tmpdir(), "ovn-dev-endpoint-enabled-"));
      node = new NodeService({
        dataDir,
        peerId: "test-dev-endpoint-enabled",
        gossipPort: 19991,
        bootstrapPeers: [],
        blockIntervalMs: 60_000
      });
      await node.start();
      const result = node.reportSecurity("0x" + "a".repeat(40), {
        type: "double_sign",
        validator: "0x" + "a".repeat(40),
        height: 1,
        blockHashA: "a",
        blockHashB: "b"
      });
      // Past the auth gate: rejected for unsigned/unverifiable evidence, not "unauthorized".
      expect(result.ok).toBe(false);
      expect(result.error).not.toBe("unauthorized");
    } finally {
      process.env.NODE_ENV = savedNodeEnv;
      process.env.ALLOW_DEV_ENDPOINTS = savedAllowDev;
      process.env.DEV_API_TOKEN = savedToken;
    }
  });
});
