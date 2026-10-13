import { decodeEventLog, getAddress, isAddress } from "viem";

export const collectionCreatedEvent = {
  type: "event",
  name: "CollectionCreated",
  inputs: [
    { name: "collection", type: "address", indexed: true },
    { name: "creator", type: "address", indexed: true },
    { name: "name", type: "string", indexed: false },
    { name: "symbol", type: "string", indexed: false },
  ],
};

export const nftMintedEvent = {
  type: "event",
  name: "NftMinted",
  inputs: [
    { name: "collection", type: "address", indexed: true },
    { name: "tokenId", type: "uint256", indexed: true },
    { name: "owner", type: "address", indexed: true },
    { name: "tokenURI", type: "string", indexed: false },
  ],
};

export const peopleNftAbi = [
  { type: "function", name: "nextTokenId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
];

const COLLECTION_CREATED_TOPIC =
  "0x5fead977881b23a0dbf2f905699203f29cefea57a576d2d4f412523191258e84";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function parseTopicAddress(topic) {
  if (!topic || topic.length < 42) return null;
  const hex = topic.startsWith("0x") ? topic.slice(-40) : topic.slice(-40);
  return getAddress(`0x${hex}`);
}

export function collectionFromReceipt(receipt, nftFactory) {
  const factoryLc = getAddress(nftFactory).toLowerCase();
  for (const log of receipt.logs ?? []) {
    if (log.address?.toLowerCase() !== factoryLc) continue;
    const topic0 = log.topics?.[0]?.toLowerCase();
    if (topic0 === COLLECTION_CREATED_TOPIC && log.topics?.[1]) {
      try {
        return parseTopicAddress(log.topics[1]);
      } catch {
        /* try decode */
      }
    }
    try {
      const decoded = decodeEventLog({
        abi: [collectionCreatedEvent],
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "CollectionCreated" && decoded.args?.collection) {
        return getAddress(decoded.args.collection);
      }
    } catch {
      /* next log */
    }
  }
  return null;
}

const NFT_MINTED_TOPIC =
  "0xf8b1b480f3e90cec0b9871e75e1c6401bf4db0127701d88d80f0a9d0b39accf7";

export function nftMintedFromReceipt(receipt, nftFactory, collection) {
  const factoryLc = getAddress(nftFactory).toLowerCase();
  const collectionLc = getAddress(collection).toLowerCase();
  for (const log of receipt.logs ?? []) {
    if (log.address?.toLowerCase() !== factoryLc) continue;
    const topic0 = log.topics?.[0]?.toLowerCase();
    if (topic0 === NFT_MINTED_TOPIC && log.topics?.[1] && log.topics?.[2]) {
      try {
        const logCollection = parseTopicAddress(log.topics[1]);
        if (logCollection?.toLowerCase() === collectionLc) {
          return BigInt(log.topics[2]);
        }
      } catch {
        /* fall through to ABI decode */
      }
    }
    try {
      const decoded = decodeEventLog({
        abi: [nftMintedEvent],
        data: log.data,
        topics: log.topics,
      });
      if (
        decoded.eventName === "NftMinted" &&
        decoded.args?.collection &&
        getAddress(decoded.args.collection).toLowerCase() === collectionLc
      ) {
        return decoded.args.tokenId;
      }
    } catch {
      /* next log */
    }
  }
  return null;
}

/** A mined transaction with status "reverted". gasUsed/gasLimit tell an out-of-gas revert apart. */
export class TxRevertedError extends Error {
  constructor(hash, gasUsed, gasLimit) {
    super(`transaction reverted: ${hash} (gasUsed=${gasUsed ?? "?"} gasLimit=${gasLimit ?? "?"})`);
    this.hash = hash;
    this.gasUsed = gasUsed;
    this.gasLimit = gasLimit;
  }
}

/** True when a revert used >= 95% of its gas limit (out of gas, not a logic revert). */
export function isOutOfGas(err) {
  if (!(err instanceof TxRevertedError) || err.gasUsed == null || !err.gasLimit) return false;
  return BigInt(err.gasUsed) * 100n >= BigInt(err.gasLimit) * 95n;
}

export async function waitForReceiptRetry(publicClient, hash) {
  const timeoutMs = Number(process.env.SEED_TX_RECEIPT_TIMEOUT_MS ?? "240000");
  const pollMs = Number(process.env.SEED_TX_RECEIPT_POLL_MS ?? "4000");
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    let receipt;
    try {
      receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: Math.min(pollMs, timeoutMs),
        pollingInterval: 2000,
      });
    } catch (err) {
      lastError = err;
      if (Date.now() - start >= timeoutMs) break;
      await sleep(pollMs);
      continue;
    }
    if (receipt.status === "success") return receipt;
    // Mined and reverted: final, do not poll again.
    const tx = await publicClient.getTransaction({ hash }).catch(() => null);
    throw new TxRevertedError(hash, receipt.gasUsed, tx?.gas);
  }
  throw lastError ?? new Error(`receipt timeout for ${hash}`);
}

export async function isUsableCollection(publicClient, nftFactory, nftFactoryAbi, collection) {
  if (!collection || !isAddress(collection)) return false;
  const addr = getAddress(collection);
  const code = await publicClient.getBytecode({ address: addr });
  if (!code || code === "0x") return false;
  try {
    return await publicClient.readContract({
      address: getAddress(nftFactory),
      abi: nftFactoryAbi,
      functionName: "isCollection",
      args: [addr],
    });
  } catch {
    return false;
  }
}

/** Wait until factory marks the collection and bytecode is present (slow nodes). */
export async function waitForVerifiedCollection(publicClient, nftFactory, nftFactoryAbi, collection) {
  const addr = getAddress(collection);
  const timeoutMs = Number(process.env.SEED_DEPLOY_CODE_TIMEOUT_MS ?? "180000");
  const pollMs = Number(process.env.SEED_DEPLOY_CODE_POLL_MS ?? "3000");
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isUsableCollection(publicClient, nftFactory, nftFactoryAbi, addr)) {
      return addr.toLowerCase();
    }
    await sleep(pollMs);
  }
  throw new Error(`collection ${addr} not deployed or not registered on factory after ${timeoutMs}ms`);
}

export async function readNextTokenIdSafe(publicClient, collection) {
  if (!(await publicClient.getBytecode({ address: getAddress(collection) }))) return 0n;
  try {
    return await publicClient.readContract({
      address: getAddress(collection),
      abi: peopleNftAbi,
      functionName: "nextTokenId",
    });
  } catch {
    return 0n;
  }
}
