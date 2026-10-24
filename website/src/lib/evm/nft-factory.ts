/**
 * Client-side glue for the deployed EVM `NftFactory` (chain 97401).
 *
 * The NFT wizard used to POST to the legacy compat endpoint
 * (`POST /api/evm/compat/tx`), which answers `405 use_evm_wallet` on this chain, so minting
 * from the site was impossible (E2E-M3). These helpers build the two writes the factory needs —
 * `createCollection` and the payable `mint` — the same way the token launch calls the ERC-20
 * factory, and decode the addresses/ids back out of the receipts.
 *
 * Kept free of React and of the wallet context so the tx-building and receipt parsing can be
 * unit-tested in plain Node.
 */
import { decodeEventLog, formatEther, getAddress, isAddress, type Address, type Hex, type PublicClient } from "viem";
import { readEvmDeployments } from "@/lib/evm/config";

export const nftFactoryAbi = [
  {
    type: "function",
    name: "createCollection",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
    ],
    outputs: [{ name: "collection", type: "address" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "payable",
    inputs: [
      { name: "collection", type: "address" },
      { name: "tokenURI", type: "string" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  { type: "function", name: "mintFee", stateMutability: "pure", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "isCollection",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "creatorOf",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "prepaidCredit",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** The ERC-721 collection the factory deploys (`PeopleNFT`): only the reads the mint page needs. */
export const peopleNftAbi = [
  { type: "function", name: "nextTokenId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
] as const;

export const collectionCreatedEvent = {
  type: "event",
  name: "CollectionCreated",
  inputs: [
    { name: "collection", type: "address", indexed: true },
    { name: "creator", type: "address", indexed: true },
    { name: "name", type: "string", indexed: false },
    { name: "symbol", type: "string", indexed: false },
  ],
} as const;

export const nftMintedEvent = {
  type: "event",
  name: "NftMinted",
  inputs: [
    { name: "collection", type: "address", indexed: true },
    { name: "tokenId", type: "uint256", indexed: true },
    { name: "owner", type: "address", indexed: true },
    { name: "tokenURI", type: "string", indexed: false },
  ],
} as const;

/** The deployed factory, or null when the deployments file has no usable address. */
export function nftFactoryAddress(): Address | null {
  const raw = readEvmDeployments().contracts.nftFactory;
  if (!raw || !isAddress(raw)) return null;
  return getAddress(raw);
}

/** `NftFactory.mintFee()` is `PeopleConstants.NFT_MINT_FEE` (2.925 PPL) as wei. */
export function feeWeiToPpl(feeWei: bigint): number {
  return Number(formatEther(feeWei));
}

/** ERC-721 symbol derived from the item's name: `[A-Z0-9]`, at most 11 chars. */
export function deriveCollectionSymbol(name: string): string {
  const symbol = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11);
  return symbol || "NFT";
}

/** Page of an NFT on the PeopleScan explorer. */
export function peoplescanNftUrl(collection: string, tokenId: bigint | number | string): string {
  return `https://peoplescan.org/nft/${collection}/${tokenId.toString()}`;
}

type NftReadClient = Pick<PublicClient, "readContract">;

/**
 * Double-mint guard: when the collection's newest token already carries `tokenUri` and belongs
 * to `owner`, a previous attempt got through (its hash may never have reached the page), so the
 * caller shows that token instead of sending another mint. Returns the token id or null.
 */
export async function findExistingMint(
  client: NftReadClient,
  collection: Address,
  tokenUri: string,
  owner: Address,
): Promise<bigint | null> {
  const next = await client.readContract({ address: collection, abi: peopleNftAbi, functionName: "nextTokenId" });
  if (next <= BigInt(0)) return null;
  const last = next - BigInt(1);
  const [uri, holder] = await Promise.all([
    client.readContract({ address: collection, abi: peopleNftAbi, functionName: "tokenURI", args: [last] }),
    client.readContract({ address: collection, abi: peopleNftAbi, functionName: "ownerOf", args: [last] }),
  ]);
  if (uri !== tokenUri || String(holder).toLowerCase() !== owner.toLowerCase()) return null;
  return last;
}

export function buildCreateCollectionRequest(factory: Address, name: string, symbol: string) {
  return { address: factory, abi: nftFactoryAbi, functionName: "createCollection", args: [name, symbol] } as const;
}

export function buildMintRequest(factory: Address, collection: Address, tokenUri: string, feeWei: bigint) {
  return { address: factory, abi: nftFactoryAbi, functionName: "mint", args: [collection, tokenUri], value: feeWei } as const;
}

type ReceiptLike = { logs?: readonly { address: string; topics: readonly Hex[]; data: Hex }[] };

/** keccak256 of the event signatures, kept in sync with `contracts/scripts/seed-97401-nft.mjs`. */
const COLLECTION_CREATED_TOPIC = "0x5fead977881b23a0dbf2f905699203f29cefea57a576d2d4f412523191258e84";
const NFT_MINTED_TOPIC = "0xf8b1b480f3e90cec0b9871e75e1c6401bf4db0127701d88d80f0a9d0b39accf7";

function topicAddress(topic: Hex | undefined): Address | null {
  if (!topic || topic.length < 42) return null;
  try {
    return getAddress(`0x${topic.slice(-40)}`);
  } catch {
    return null;
  }
}

/** Address of the collection the factory created, decoded from a `createCollection` receipt. */
export function collectionFromReceipt(receipt: ReceiptLike, factory: Address): Address | null {
  const factoryLc = factory.toLowerCase();
  for (const log of receipt.logs ?? []) {
    if (log.address.toLowerCase() !== factoryLc) continue;
    try {
      const decoded = decodeEventLog({
        abi: [collectionCreatedEvent],
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName === "CollectionCreated" && decoded.args.collection) {
        return getAddress(decoded.args.collection);
      }
    } catch {
      /* topic-only fallback below */
    }
    if (log.topics[0]?.toLowerCase() !== COLLECTION_CREATED_TOPIC) continue;
    const fromTopic = topicAddress(log.topics[1]);
    if (fromTopic) return fromTopic;
  }
  return null;
}

/** Token id decoded from a `mint` receipt, matched to the collection that was minted into. */
export function tokenIdFromReceipt(receipt: ReceiptLike, factory: Address, collection: Address): bigint | null {
  const factoryLc = factory.toLowerCase();
  const collectionLc = collection.toLowerCase();
  for (const log of receipt.logs ?? []) {
    if (log.address.toLowerCase() !== factoryLc) continue;
    try {
      const decoded = decodeEventLog({
        abi: [nftMintedEvent],
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (
        decoded.eventName === "NftMinted" &&
        decoded.args.collection.toLowerCase() === collectionLc
      ) {
        return decoded.args.tokenId;
      }
    } catch {
      /* topic-only fallback below */
    }
    if (log.topics[0]?.toLowerCase() !== NFT_MINTED_TOPIC) continue;
    const logCollection = topicAddress(log.topics[1]);
    const tokenId = log.topics[2];
    if (logCollection?.toLowerCase() === collectionLc && tokenId) {
      try {
        return BigInt(tokenId);
      } catch {
        /* try next log */
      }
    }
  }
  return null;
}

export type NftWriteErrorCode =
  | "wallet_rejected"
  | "insufficient_funds"
  | "insufficient_fee"
  | "not_collection_creator"
  | "receipt_failed"
  | "chain_mismatch"
  | "timeout"
  | "unknown";

/** Turn a viem/driver error into a code the UI can explain, keeping the raw text as detail. */
export function classifyNftWriteError(err: unknown): { code: NftWriteErrorCode; detail: string } {
  const detail = err instanceof Error ? err.message : String(err ?? "error");
  const lower = detail.toLowerCase();
  let code: NftWriteErrorCode = "unknown";
  if (lower.includes("user rejected") || lower.includes("user denied") || lower.includes("4001")) {
    code = "wallet_rejected";
  } else if (lower.includes("insufficient funds") || lower.includes("exceeds balance")) {
    code = "insufficient_funds";
  } else if (lower.includes("insufficientfee")) {
    code = "insufficient_fee";
  } else if (lower.includes("unauthorized")) {
    code = "not_collection_creator";
  } else if (lower.includes("chain mismatch") || lower.includes("does not match the target chain") || lower.includes("wrong network")) {
    code = "chain_mismatch";
  } else if (lower.includes("timed out") || lower.includes("timeout")) {
    code = "timeout";
  } else if (lower.includes("receipt") || lower.includes("reverted")) {
    code = "receipt_failed";
  }
  return { code, detail };
}
