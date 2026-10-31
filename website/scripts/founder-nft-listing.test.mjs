// Owner NFT pages must list a Founder NFT once. Appending it on every cursor page
// duplicates it, and it has to obey the same collection/tokenId query as the other rows.
import { createServer } from "node:http";
import test from "node:test";
import assert from "node:assert/strict";
import { decodeFunctionData, encodeEventTopics, encodeFunctionResult, getAddress, zeroAddress } from "viem";
import { readEvmDeployments } from "../src/lib/evm/config.ts";
import { LOG_WINDOW_BLOCKS, resetChainCatalogCacheForTests } from "../src/lib/evm/chain-catalog.ts";
import { handleEvmCompatGet } from "../src/lib/evm/people-compat.ts";
import { resetRpcBackoffForTests } from "../src/lib/evm/rpc-server.ts";
import { resetMintHistoryForTests, setNftHistoryPageSizeForTests } from "../src/lib/evm/nft-chain.ts";
import { founderNftAbi } from "../src/lib/founders/founder-nft-abi.ts";

const OWNER = "0x1111111111111111111111111111111111111111";
const FOUNDER = getAddress("0x00000000000000000000000000000000000000f1");
const OTHER_COLLECTION = getAddress("0x2222222222222222222222222222222222222222");
const FOUNDER_TOKEN_ID = 7n;
const FOUNDER_NFT_ID = "founder-nft-7";

const transferTopics = encodeEventTopics({
  abi: founderNftAbi,
  eventName: "Transfer",
  args: { from: zeroAddress, to: getAddress(OWNER), tokenId: FOUNDER_TOKEN_ID },
});

function founderCallResult(data) {
  const decoded = decodeFunctionData({ abi: founderNftAbi, data });
  if (decoded.functionName === "balanceOf") {
    return encodeFunctionResult({ abi: founderNftAbi, functionName: "balanceOf", result: 1n });
  }
  if (decoded.functionName === "ownerOf") {
    return encodeFunctionResult({ abi: founderNftAbi, functionName: "ownerOf", result: getAddress(OWNER) });
  }
  if (decoded.functionName === "tokenURI") {
    return encodeFunctionResult({ abi: founderNftAbi, functionName: "tokenURI", result: "ipfs://founder-7" });
  }
  if (decoded.functionName === "totalSupply") {
    return encodeFunctionResult({ abi: founderNftAbi, functionName: "totalSupply", result: FOUNDER_TOKEN_ID });
  }
  return "0x";
}

function listen(onCall) {
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const calls = Array.isArray(body) ? body : [body];
      const results = calls.map((call) => ({ jsonrpc: "2.0", id: call.id, result: onCall(call) }));
      const payload = Array.isArray(body) ? results : results[0];
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function useNode(t, server) {
  const previousRpc = process.env.EVM_RPC_URL;
  const previousPublicRpc = process.env.NEXT_PUBLIC_EVM_RPC_URL;
  const previousFounder = process.env.NEXT_PUBLIC_FOUNDER_NFT_ADDRESS;
  const url = `http://127.0.0.1:${server.address().port}`;
  process.env.EVM_RPC_URL = url;
  process.env.NEXT_PUBLIC_EVM_RPC_URL = url;
  process.env.NEXT_PUBLIC_FOUNDER_NFT_ADDRESS = FOUNDER;
  resetChainCatalogCacheForTests();
  resetRpcBackoffForTests();
  resetMintHistoryForTests();
  t.after(async () => {
    setNftHistoryPageSizeForTests(null);
    resetMintHistoryForTests();
    resetChainCatalogCacheForTests();
    resetRpcBackoffForTests();
    if (previousRpc === undefined) delete process.env.EVM_RPC_URL;
    else process.env.EVM_RPC_URL = previousRpc;
    if (previousPublicRpc === undefined) delete process.env.NEXT_PUBLIC_EVM_RPC_URL;
    else process.env.NEXT_PUBLIC_EVM_RPC_URL = previousPublicRpc;
    if (previousFounder === undefined) delete process.env.NEXT_PUBLIC_FOUNDER_NFT_ADDRESS;
    else process.env.NEXT_PUBLIC_FOUNDER_NFT_ADDRESS = previousFounder;
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  });
}

function founderReadsOf(call, founderReads) {
  const address = (call.method === "eth_call" ? call.params?.[0]?.to : call.params?.[0]?.address) ?? "";
  if (String(address).toLowerCase() !== FOUNDER.toLowerCase()) return false;
  founderReads.n += 1;
  return true;
}

function rpcResult(call, latest, founderReads) {
  if (call.method === "eth_chainId") return `0x${(97401).toString(16)}`;
  if (call.method === "eth_blockNumber") return `0x${latest.toString(16)}`;
  if (call.method === "eth_getLogs") {
    if (!founderReadsOf(call, founderReads)) return [];
    return [
      {
        address: FOUNDER,
        topics: transferTopics,
        data: "0x",
        blockNumber: `0x${latest.toString(16)}`,
        transactionHash: `0x${"ab".repeat(32)}`,
        logIndex: "0x0",
        blockHash: `0x${"cd".repeat(32)}`,
        removed: false,
      },
    ];
  }
  if (call.method === "eth_call" && founderReadsOf(call, founderReads)) {
    try {
      return founderCallResult(call.params[0].data);
    } catch {
      return "0x";
    }
  }
  return "0x";
}

function pageItems(response) {
  return Array.isArray(response.body) ? response.body : response.body.items;
}

function founderIds(items) {
  return items.filter((item) => item.nftId === FOUNDER_NFT_ID).map((item) => item.nftId);
}

test("founder nft is only on the first owner page and is not repeated across the cursor", async (t) => {
  setNftHistoryPageSizeForTests(1);
  const dep = readEvmDeployments();
  const latest = dep.startBlocks.nftFactory + 8 * LOG_WINDOW_BLOCKS;
  const founderReads = { n: 0 };
  const server = await listen((call) => rpcResult(call, latest, founderReads));
  await useNode(t, server);

  const seen = [];
  let cursor;
  let pages = 0;
  for (;;) {
    const params = new URLSearchParams({ owner: OWNER });
    if (cursor) params.set("cursor", cursor);
    const before = founderReads.n;
    const response = await handleEvmCompatGet("nfts", params);
    const ids = founderIds(pageItems(response));
    if (pages === 0) {
      assert.deepEqual(ids, [FOUNDER_NFT_ID]);
      assert.ok(founderReads.n > before, "the first page reads the founder nft");
    } else {
      assert.deepEqual(ids, [], `page ${pages + 1}`);
      assert.equal(founderReads.n, before, `page ${pages + 1} read the founder nft`);
    }
    seen.push(...ids);
    pages += 1;
    const partial = response.headers?.["X-Nfts-Partial"] === "1";
    if (!partial) break;
    cursor = response.headers?.["X-Nfts-Next"];
    assert.equal(typeof cursor, "string");
    assert.ok(pages < 40);
  }
  assert.ok(pages > 1);
  assert.deepEqual(seen, [FOUNDER_NFT_ID]);
});

test("collection and tokenId queries omit a founder nft from another collection or token", async (t) => {
  const dep = readEvmDeployments();
  const latest = dep.startBlocks.nftFactory + 8 * LOG_WINDOW_BLOCKS;
  const founderReads = { n: 0 };
  const server = await listen((call) => rpcResult(call, latest, founderReads));
  await useNode(t, server);

  const otherCollection = await handleEvmCompatGet(
    "nfts",
    new URLSearchParams({ owner: OWNER, collection: OTHER_COLLECTION }),
  );
  assert.deepEqual(founderIds(pageItems(otherCollection)), []);

  const otherToken = await handleEvmCompatGet("nfts", new URLSearchParams({ owner: OWNER, tokenId: "999" }));
  assert.deepEqual(founderIds(pageItems(otherToken)), []);

  const matched = await handleEvmCompatGet(
    "nfts",
    new URLSearchParams({ owner: OWNER, collection: FOUNDER, tokenId: "7" }),
  );
  assert.deepEqual(founderIds(pageItems(matched)), [FOUNDER_NFT_ID]);
});
