import { afterEach, describe, expect, test } from "vitest";
import Fastify from "fastify";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPublicClient, http } from "viem";
import { EIP155_CHAIN_ID } from "@ovn/protocol";
import { NodeService } from "./node-service.js";
import { jsonRpcMaxBatch } from "@ovn/core";
import { registerJsonRpcRoutes } from "./json-rpc.js";

describe("JSON-RPC integration (viem)", () => {
  let dataDir = "";
  let node: NodeService | null = null;
  let server: ReturnType<typeof Fastify> | null = null;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
    if (node) {
      await node.stop();
      node = null;
    }
    if (dataDir) {
      await rm(dataDir, { recursive: true, force: true });
      dataDir = "";
    }
  });

  test("viem reads chainId, balance, and eth_call", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "ovn-jsonrpc-"));
    node = new NodeService({
      dataDir,
      peerId: "jsonrpc-viem",
      gossipPort: 20996,
      bootstrapPeers: [],
      blockIntervalMs: 60_000
    });
    await node.start();

    server = Fastify();
    registerJsonRpcRoutes(server, node);
    const address = await server.listen({ port: 0, host: "127.0.0.1" });
    const port = Number(new URL(address).port);
    const transport = http(`http://127.0.0.1:${port}/rpc`);
    const client = createPublicClient({ transport, chain: undefined });

    const chainId = await client.getChainId();
    expect(chainId).toBe(EIP155_CHAIN_ID);

    const { FAUCET_ADDRESS } = await import("@ovn/core");
    const balance = await client.getBalance({ address: FAUCET_ADDRESS as `0x${string}` });
    expect(balance > 0n).toBe(true);

    const gas = await client.request({ method: "eth_gasPrice" });
    expect(typeof gas).toBe("string");

    const blockNumber = await client.getBlockNumber();
    expect(blockNumber).toBeGreaterThanOrEqual(0n);
  });

  /** M16-1: one HTTP request must not be able to run an unbounded number of calls. */
  test("an over-long batch is refused with -32600 and nothing is executed", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "ovn-jsonrpc-batch-"));
    node = new NodeService({
      dataDir,
      peerId: "jsonrpc-batch",
      gossipPort: 20997,
      bootstrapPeers: [],
      blockIntervalMs: 60_000
    });
    await node.start();
    server = Fastify();
    registerJsonRpcRoutes(server, node);
    const address = await server.listen({ port: 0, host: "127.0.0.1" });

    const over = Array.from({ length: jsonRpcMaxBatch() + 1 }, (_, i) => ({
      jsonrpc: "2.0",
      id: i,
      method: "eth_chainId",
      params: []
    }));
    const refused = await fetch(`${address}/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(over)
    });
    expect(refused.status).toBe(200);
    expect(await refused.json()).toMatchObject({ error: { code: -32600, message: "Batch too large" } });

    const allowed = over.slice(0, jsonRpcMaxBatch());
    const ok = await fetch(`${address}/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(allowed)
    });
    const body = (await ok.json()) as unknown[];
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(jsonRpcMaxBatch());
  });

  test("eth_call batches spend the per-IP contract-call budget", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "ovn-jsonrpc-rate-"));
    node = new NodeService({
      dataDir,
      peerId: "jsonrpc-rate",
      gossipPort: 20998,
      bootstrapPeers: [],
      blockIntervalMs: 60_000
    });
    await node.start();
    server = Fastify();
    registerJsonRpcRoutes(server, node);
    const address = await server.listen({ port: 0, host: "127.0.0.1" });

    const call = {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: `0x${"11".repeat(20)}`, data: "0x", gas: "0x3d0900" }]
    };
    // Default CONTRACT_CALL_RATE_LIMIT_PER_MIN is 30; two batches of 20 exceed it.
    const batch = Array.from({ length: 20 }, (_, i) => ({ ...call, id: i }));
    const errors: number[] = [];
    for (const _attempt of [0, 1]) {
      const res = await fetch(`${address}/rpc`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(batch)
      });
      const items = (await res.json()) as Array<{ error?: { message?: string } }>;
      errors.push(items.filter((item) => item.error?.message?.includes("rate limit")).length);
    }
    // 40 calls against a budget of 30: the first batch passes, the last 10 are refused.
    expect(errors).toEqual([0, 10]);
  });
});
