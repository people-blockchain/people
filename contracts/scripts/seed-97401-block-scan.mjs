/**
 * Deployer history scan without eth_getLogs — walks blocks and reads receipts.
 */

const TOKEN_CREATED =
  "0x10911c4cd4fbfa42352cbeb31e021abbab48257dff3d94957b57da33a205d724";
const COLLECTION_CREATED =
  "0x5fead977881b23a0dbf2f905699203f29cefea57a576d2d4f412523191258e84";
const PAIR_CREATED =
  "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseTopicAddress(topic) {
  if (!topic || topic.length < 66) return null;
  const hex = topic.startsWith("0x") ? topic.slice(-40) : topic.slice(-40);
  return `0x${hex}`.toLowerCase();
}

export function parseReceiptEvents(receipt, factories = {}) {
  const tokenFactory = factories.tokenFactory?.toLowerCase();
  const nftFactory = factories.nftFactory?.toLowerCase();
  const ammFactory = factories.ammFactory?.toLowerCase();
  const out = { tokens: [], collections: [], pairs: [] };
  if (!receipt?.logs) return out;

  for (const log of receipt.logs) {
    const topic0 = log.topics?.[0]?.toLowerCase();
    const addr = log.address?.toLowerCase();
    if (!topic0) continue;

    if (topic0 === TOKEN_CREATED && addr === tokenFactory) {
      const token = parseTopicAddress(log.topics[1]);
      const creator = parseTopicAddress(log.topics[2]);
      if (token) {
        out.tokens.push({
          token,
          creator,
          blockNumber: receipt.blockNumber,
          transactionHash: receipt.transactionHash,
          logIndex: log.logIndex ?? 0,
        });
      }
    }
    if (topic0 === COLLECTION_CREATED && addr === nftFactory) {
      const collection = parseTopicAddress(log.topics[1]);
      const creator = parseTopicAddress(log.topics[2]);
      if (collection) {
        out.collections.push({
          collection,
          creator,
          blockNumber: receipt.blockNumber,
          transactionHash: receipt.transactionHash,
          logIndex: log.logIndex ?? 0,
        });
      }
    }
    if (topic0 === PAIR_CREATED && addr === ammFactory) {
      const token0 = parseTopicAddress(log.topics[1]);
      const token1 = parseTopicAddress(log.topics[2]);
      let pair = null;
      if (log.data && log.data.length >= 66) {
        pair = `0x${log.data.slice(26, 66)}`.toLowerCase();
      }
      if (pair) {
        out.pairs.push({
          pair,
          token0,
          token1,
          blockNumber: receipt.blockNumber,
          transactionHash: receipt.transactionHash,
          logIndex: log.logIndex ?? 0,
        });
      }
    }
  }
  return out;
}

async function pmap(items, concurrency, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function getBlockWithRetry(publicClient, blockNumber, opts = {}) {
  const retries = opts.retries ?? 4;
  const timeoutMs = Number(process.env.SEED_BLOCK_RPC_TIMEOUT_MS ?? "25000");
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const block = await Promise.race([
        publicClient.getBlock({ blockNumber, includeTransactions: true }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`getBlock timeout ${blockNumber}`)), timeoutMs),
        ),
      ]);
      return block;
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await sleep(400 * 2 ** attempt);
    }
  }
  throw new Error("unreachable");
}

async function getReceiptWithRetry(publicClient, hash) {
  const retries = 4;
  const timeoutMs = Number(process.env.SEED_BLOCK_RPC_TIMEOUT_MS ?? "25000");
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await Promise.race([
        publicClient.getTransactionReceipt({ hash }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`getTransactionReceipt timeout ${hash}`)), timeoutMs),
        ),
      ]);
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await sleep(400 * 2 ** attempt);
    }
  }
  throw new Error("unreachable");
}

/**
 * Scan [fromBlock, toBlock] for deployer txs to watch addresses; parse receipts.
 */
export async function scanDeployerReceipts(
  publicClient,
  deployer,
  watchAddresses,
  fromBlock,
  toBlock,
  factories,
  onProgress,
) {
  const deployerLc = deployer.toLowerCase();
  const txJobs = [];

  const batchSize = BigInt(Math.max(1, Number(process.env.SEED_BLOCK_SCAN_BATCH ?? "32")));
  const concurrency = Math.max(1, Number(process.env.SEED_BLOCK_SCAN_CONCURRENCY ?? "10"));
  const receiptConcurrency = Math.max(1, Number(process.env.SEED_RECEIPT_SCAN_CONCURRENCY ?? "12"));

  let scanned = 0n;
  const total = toBlock - fromBlock + 1n;

  for (let start = fromBlock; start <= toBlock; start += batchSize) {
    const end = start + batchSize - 1n > toBlock ? toBlock : start + batchSize - 1n;
    const blockNums = [];
    for (let b = start; b <= end; b++) blockNums.push(b);

    const blocks = await pmap(blockNums, concurrency, (n) => getBlockWithRetry(publicClient, n));

    for (const block of blocks) {
      if (!block?.transactions) continue;
      for (const tx of block.transactions) {
        if (typeof tx === "string") continue;
        if (tx.from?.toLowerCase() !== deployerLc) continue;
        txJobs.push({
          hash: tx.hash,
          blockNumber: block.number,
          to: tx.to ? tx.to.toLowerCase() : null,
        });
      }
    }

    scanned += BigInt(blockNums.length);
    if (onProgress) onProgress({ scanned, total, txJobs: txJobs.length });
  }

  const merged = { tokens: [], collections: [], pairs: [] };
  const uniqueHashes = [...new Map(txJobs.map((j) => [j.hash, j])).values()];

  for (let i = 0; i < uniqueHashes.length; i += receiptConcurrency) {
    const slice = uniqueHashes.slice(i, i + receiptConcurrency);
    const receipts = await pmap(slice, receiptConcurrency, (j) => getReceiptWithRetry(publicClient, j.hash));
    for (const receipt of receipts) {
      if (!receipt) continue;
      const parsed = parseReceiptEvents(receipt, factories);
      merged.tokens.push(...parsed.tokens);
      merged.collections.push(...parsed.collections);
      merged.pairs.push(...parsed.pairs);
    }
  }

  return {
    tokens: merged.tokens,
    collections: merged.collections,
    pairs: merged.pairs,
    deployerTxCount: uniqueHashes.length,
    blocksScanned: Number(total),
  };
}
