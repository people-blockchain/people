import { createPublicClient, defineChain, http, parseAbiItem, zeroAddress, type Address, type Hex, type PublicClient } from "viem";
import { founderNftAbi } from "./founder-nft-abi.ts";
import type { FounderNftPublicConfig } from "./founder-nft-config.ts";

export type FounderNftPendingRebind = {
  oldHolder: Address;
  newHolder: Address;
  /** Unix seconds from which `executeRebind` is allowed. */
  executeAfter: bigint;
  signerEpoch: bigint;
};

/** Read side of the contract. Injected in tests; `createFounderNftChainReader` is the viem one. */
export type FounderNftChainReader = {
  tokenOfPerson(personId: Hex): Promise<bigint>;
  personOf(tokenId: bigint): Promise<Hex>;
  /** Null when the token does not exist. */
  ownerOf(tokenId: bigint): Promise<Address | null>;
  balanceOf(owner: Address): Promise<bigint>;
  /** Token id held by `owner`, 0 if none (one token per address). */
  tokenOfOwner(owner: Address): Promise<bigint>;
  /** Null when no rebind is pending for the person. */
  pendingRebind(personId: Hex): Promise<FounderNftPendingRebind | null>;
  mintDeadline(): Promise<bigint>;
  signerEpoch(): Promise<bigint>;
  totalSupply(): Promise<bigint>;
  tokenURI(tokenId: bigint): Promise<string | null>;
};

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)");
const SCAN_LIMIT = 500;
const SCAN_CHUNK = 25;

/**
 * Cosmos EVM rejects `eth_getLogs` over more than 10,000 blocks. Each window stays at or under
 * 9,000, matching the rest of the site. A holder lookup never uses one open-ended range.
 */
export const FOUNDER_NFT_LOG_WINDOW_BLOCKS = BigInt(9_000);

export function founderNftLogWindows(
  fromBlock: bigint,
  toBlock: bigint,
  size = FOUNDER_NFT_LOG_WINDOW_BLOCKS,
): Array<{ fromBlock: bigint; toBlock: bigint }> {
  if (size <= BigInt(0) || toBlock < fromBlock) return [];
  const out: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  for (let start = fromBlock; start <= toBlock; start += size) {
    const end = start + size - BigInt(1);
    out.push({ fromBlock: start, toBlock: end > toBlock ? toBlock : end });
  }
  return out;
}

export function createFounderNftViemClient(config: FounderNftPublicConfig, rpcUrl: string): PublicClient {
  const chain = defineChain({
    id: config.chainId,
    name: "PEOPLE Blockchain testnet",
    nativeCurrency: { name: "People", symbol: "PPL", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  return createPublicClient({ chain, transport: http(rpcUrl) }) as PublicClient;
}

export function createFounderNftChainReader(client: PublicClient, config: FounderNftPublicConfig): FounderNftChainReader {
  const address = config.address;
  const read = <T>(functionName: string, args?: readonly unknown[]) =>
    client.readContract({ address, abi: founderNftAbi, functionName, args } as never) as Promise<T>;

  const reader: FounderNftChainReader = {
    tokenOfPerson: (personId) => read<bigint>("tokenOfPerson", [personId]),
    personOf: (tokenId) => read<Hex>("personOf", [tokenId]),
    async ownerOf(tokenId) {
      try {
        return await read<Address>("ownerOf", [tokenId]);
      } catch {
        return null;
      }
    },
    balanceOf: (owner) => read<bigint>("balanceOf", [owner]),
    async tokenOfOwner(owner) {
      if ((await reader.balanceOf(owner)) === BigInt(0)) return BigInt(0);
      const want = owner.toLowerCase();
      try {
        const latest = await client.getBlockNumber();
        const windows = founderNftLogWindows(BigInt(0), latest).reverse();
        for (const window of windows) {
          const logs = await client.getLogs({
            address,
            event: transferEvent,
            args: { to: owner },
            fromBlock: window.fromBlock,
            toBlock: window.toBlock,
          });
          for (const log of [...logs].reverse()) {
            const id = log.args.tokenId;
            if (id === undefined) continue;
            if ((await reader.ownerOf(id))?.toLowerCase() === want) return id;
          }
        }
      } catch {
        /* a window was refused: fall back to walking the (small) id space */
      }
      const total = await reader.totalSupply();
      const last = total > BigInt(SCAN_LIMIT) ? SCAN_LIMIT : Number(total);
      for (let from = 1; from <= last; from += SCAN_CHUNK) {
        const ids = Array.from({ length: Math.min(SCAN_CHUNK, last - from + 1) }, (_, i) => BigInt(from + i));
        const owners = await Promise.all(ids.map((id) => reader.ownerOf(id)));
        const hit = owners.findIndex((o) => o?.toLowerCase() === want);
        if (hit >= 0) return ids[hit];
      }
      return BigInt(0);
    },
    async pendingRebind(personId) {
      const [oldHolder, executeAfter, newHolder, signerEpoch] = await read<readonly [Address, bigint, Address, bigint]>(
        "pendingRebinds",
        [personId],
      );
      if (executeAfter === BigInt(0) || newHolder === zeroAddress) return null;
      return { oldHolder, newHolder, executeAfter, signerEpoch };
    },
    mintDeadline: () => read<bigint>("mintDeadline"),
    async signerEpoch() {
      return BigInt(await read<number | bigint>("signerEpoch"));
    },
    totalSupply: () => read<bigint>("totalSupply"),
    async tokenURI(tokenId) {
      try {
        return await read<string>("tokenURI", [tokenId]);
      } catch {
        return null;
      }
    },
  };
  return reader;
}

/** `{ name, image }` from the contract's fully on-chain base64 JSON `tokenURI`; null if unparseable. */
export function parseFounderNftTokenUri(uri: string | null): { name: string; image: string | null } | null {
  const prefix = "data:application/json;base64,";
  if (!uri?.startsWith(prefix)) return null;
  try {
    const json = JSON.parse(Buffer.from(uri.slice(prefix.length), "base64").toString("utf8")) as {
      name?: unknown;
      image?: unknown;
    };
    if (typeof json.name !== "string") return null;
    const image = typeof json.image === "string" && json.image.startsWith("data:image/") ? json.image : null;
    return { name: json.name, image };
  } catch {
    return null;
  }
}
