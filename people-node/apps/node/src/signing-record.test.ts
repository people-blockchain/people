import { afterEach, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChainStore } from "@people/core";
import { NodeService } from "./node-service.js";

/**
 * M10-3: a proposer archives and publishes a block before its chain snapshot is persisted.
 * A crash in between used to bring the node back one block behind and re-sign a *different*
 * block at the same height — equivocation the network slashes for. The signing record is
 * written before publish; the restart replays the signed block from the archive instead.
 */

const dirs: string[] = [];
const nodes: NodeService[] = [];
const previousArchiveMode = process.env.ARCHIVE_MODE;

async function makeDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "people-signing-"));
  dirs.push(dir);
  return dir;
}

function makeNode(dataDir: string): NodeService {
  const node = new NodeService({
    dataDir,
    peerId: `signing-${nodes.length}`,
    gossipPort: 0,
    bootstrapPeers: [],
    blockIntervalMs: 60_000
  });
  nodes.push(node);
  return node;
}

function internals(node: NodeService) {
  return {
    store: Reflect.get(node, "store") as ChainStore,
    persist: (Reflect.get(node, "persist") as () => Promise<void>).bind(node),
    tick: (Reflect.get(node, "tickAsync") as () => Promise<void>).bind(node)
  };
}

afterEach(async () => {
  for (const node of nodes.splice(0)) await node.stop().catch(() => undefined);
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
  if (previousArchiveMode === undefined) delete process.env.ARCHIVE_MODE;
  else process.env.ARCHIVE_MODE = previousArchiveMode;
});

test("signing record round-trips through the chain database", async () => {
  const dir = await makeDir();
  const store = new ChainStore(join(dir, "chain.db"));
  await store.open();
  expect(await store.loadSigningRecord()).toBeNull();
  await store.saveSigningRecord({ height: 7, hash: "0xabc" });
  expect(await store.loadSigningRecord()).toEqual({ height: 7, hash: "0xabc" });
  await store.close();

  const reopened = new ChainStore(join(dir, "chain.db"));
  await reopened.open();
  expect(await reopened.loadSigningRecord()).toEqual({ height: 7, hash: "0xabc" });
  await reopened.close();
});

test("a node that dies after signing replays its own block instead of signing a second one", async () => {
  process.env.ARCHIVE_MODE = "1";
  const dir = await makeDir();

  const first = makeNode(dir);
  await first.start();
  const firstInternals = internals(first);
  await firstInternals.persist();
  const genesisSnapshot = await firstInternals.store.load();
  expect(genesisSnapshot).not.toBeNull();

  await firstInternals.tick();
  const signed = first.getBlockByHeight(1);
  expect(signed).not.toBeNull();
  await first.stop();

  // Crash before the persistence timer fired: the snapshot on disk is still at genesis, while
  // the block and the signing record are already there.
  const crashed = new ChainStore(join(dir, "chain.db"), true);
  await crashed.open();
  expect(await crashed.loadSigningRecord()).toEqual({ height: 1, hash: signed!.hash });
  expect(await crashed.getBlock(1)).not.toBeNull();
  await crashed.save(genesisSnapshot!);
  await crashed.close();

  const second = makeNode(dir);
  await second.start();
  expect(second.getBlockByHeight(1)?.hash).toBe(signed!.hash);

  // And it must not sign a competing block at that height on the next proposal round.
  await internals(second).tick();
  expect(second.getBlockByHeight(1)?.hash).toBe(signed!.hash);
  expect(second.getHead().height).toBeGreaterThanOrEqual(1);
});
