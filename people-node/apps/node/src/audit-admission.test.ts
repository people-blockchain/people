import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBlock, createInitialState, generateKeyPair, ensureAccount, setAccountBalance, signTransaction, computeStateRoot } from "@people/core";
import { NodeService } from "./node-service.js";

const nodes: NodeService[] = [];
const dirs: string[] = [];
async function makeNode(dataDir?: string, height?: number) {
  const dir = dataDir ?? await mkdtemp(join(tmpdir(), "people-audit-"));
  if (!dataDir) dirs.push(dir);
  const node = new NodeService({ dataDir: dir, peerId: `audit-${nodes.length}`, gossipPort: 0, bootstrapPeers: [], blockIntervalMs: 60_000 });
  if (height !== undefined) {
    node.config.securityUpgrade = { height, validatorAllowlist: [] };
    node.chainState = createInitialState(node.config);
  }
  await node.start(); nodes.push(node);
  return node;
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const node of nodes.splice(0)) await node.stop();
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
function fundedTransfer(node: NodeService) {
  const key = generateKeyPair(); ensureAccount(node.chainState, key.address);
  setAccountBalance(node.chainState.accounts[key.address]!, "ppl", 10);
  return signTransaction(key.privateKey, { id: "untrusted-id", chainId: node.config.chainId,
    from: key.address, to: "0x" + "1".repeat(40), amount: 1, fee: 0.004875,
    nonce: 0, timestamp: Date.now(), type: "transfer" }, true);
}

test("invalid signatures cannot exhaust the victim's signer quota", async () => {
  const node = await makeNode(); const tx = fundedTransfer(node);
  for (let i = 0; i < 130; i++) expect(node.submitTransaction({ ...tx, signature: "00" }).accepted).toBe(false);
  expect(node.submitTransaction(tx)).toEqual({ accepted: true });
});

test("P2P admission applies the same funding and public tariff checks", async () => {
  const node = await makeNode(); const tx = fundedTransfer(node);
  const key = generateKeyPair();
  const unfunded = signTransaction(key.privateKey, { ...tx, from: key.address }, true);
  const gossip = Reflect.get(Reflect.get(node, "gossip"), "emitter");
  gossip.emit("tx", unfunded);
  expect(node.chainState.mempool).toHaveLength(0);
  expect(Reflect.get(node, "txRateMap").size).toBe(0);
  gossip.emit("tx", tx);
  expect(node.chainState.mempool.map(t => t.id)).toEqual([tx.id]);
});

test("local arrival TTL releases pending slots without changing confirmed accounts", async () => {
  const node = await makeNode(); const tx = fundedTransfer(node);
  const before = structuredClone(node.chainState.accounts);
  expect(node.submitTransaction(tx).accepted).toBe(true);
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 10 * 60_000 + 1);
  expect(node.submitTransaction(tx).accepted).toBe(true);
  expect(node.chainState.mempool).toHaveLength(1);
  expect(node.chainState.accounts).toEqual(before);
});

test("an upgrade scheduled above the head survives restart without changing genesis or committed roots", async () => {
  const first = await makeNode();
  await buildBlock(first.chainState, "bootstrap-validator", first.config, process.env.BOOTSTRAP_PRIVATE_KEY!);
  const genesis = first.chainState.chain[0]!.hash;
  const head = first.getHead(); const root = computeStateRoot(first.chainState);
  const dir = dirs[0]!;
  Reflect.get(first, "queuePersist").call(first);
  await first.stop(); nodes.splice(nodes.indexOf(first), 1);
  const scheduled = await makeNode(dir, head.height + 5);
  expect(scheduled.getHead()).toEqual(head);
  expect(scheduled.chainState.chain[0]!.hash).toBe(genesis);
  expect(computeStateRoot(scheduled.chainState)).toBe(root);
  Reflect.get(scheduled, "queuePersist").call(scheduled);
  await scheduled.stop(); nodes.splice(nodes.indexOf(scheduled), 1);
  const restarted = await makeNode(dir, head.height + 5);
  expect(restarted.config.securityUpgrade?.height).toBe(head.height + 5);
  expect(restarted.getHead()).toEqual(head);
  await restarted.stop(); nodes.splice(nodes.indexOf(restarted), 1);
  await expect(makeNode(dir, head.height + 6)).rejects.toThrow("configuration changed");
});
