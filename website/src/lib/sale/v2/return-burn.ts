import { decodeEventLog, getAddress, parseAbiItem, type Address, type Hex } from "viem";

/** PEOPLE mainnet, where returned PPL are burned. */
export const PEOPLE_MAINNET_CHAIN_ID = 97401;

export const RETURN_BURNED_EVENT = parseAbiItem(
  "event ReturnBurned(bytes32 indexed returnId, address indexed from, address indexed hub, bytes32 personId, address seller, uint256 amount, uint256 destChainId)",
);

export const PPL_RETURN_BURN_ABI = [
  {
    type: "function",
    name: "burnForReturn",
    stateMutability: "payable",
    inputs: [
      { name: "hub", type: "address" },
      { name: "personId", type: "bytes32" },
      { name: "seller", type: "address" },
      { name: "destChainId", type: "uint256" },
    ],
    outputs: [{ name: "returnId", type: "bytes32" }],
  },
  {
    type: "event",
    name: "ReturnBurned",
    inputs: [
      { name: "returnId", type: "bytes32", indexed: true },
      { name: "from", type: "address", indexed: true },
      { name: "hub", type: "address", indexed: true },
      { name: "personId", type: "bytes32", indexed: false },
      { name: "seller", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "destChainId", type: "uint256", indexed: false },
    ],
  },
] as const;

export const MAINNET_RETURN_TYPES = {
  MainnetReturn: [
    { name: "personId", type: "bytes32" },
    { name: "hub", type: "address" },
    { name: "seller", type: "address" },
    { name: "pplAmount", type: "uint256" },
    { name: "sourceChainId", type: "uint256" },
    { name: "destChainId", type: "uint256" },
    { name: "returnId", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export type ReturnBurn = {
  returnId: Hex;
  from: Address;
  hub: Address;
  personId: Hex;
  seller: Address;
  amount: bigint;
  destChainId: bigint;
};

export type ReturnLog = { address?: string; topics: readonly Hex[]; data: Hex };

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** The first `ReturnBurned` log from `burn` whose hub matches. */
export function decodeReturnBurned(
  logs: readonly ReturnLog[],
  expected: { burn: Address; hub: Address; returnId?: Hex; destChainId?: bigint },
): ReturnBurn | null {
  for (const log of logs) {
    if (!log.address || !sameAddress(log.address, expected.burn)) continue;
    try {
      const decoded = decodeEventLog({
        abi: [RETURN_BURNED_EVENT],
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName !== "ReturnBurned") continue;
      const args = decoded.args as {
        returnId: Hex;
        from: Address;
        hub: Address;
        personId: Hex;
        seller: Address;
        amount: bigint;
        destChainId: bigint;
      };
      if (!sameAddress(args.hub, expected.hub)) continue;
      if (expected.returnId && args.returnId.toLowerCase() !== expected.returnId.toLowerCase()) continue;
      if (expected.destChainId !== undefined && args.destChainId !== expected.destChainId) continue;
      if (args.amount <= BigInt(0) || args.destChainId <= BigInt(0)) continue;
      return {
        returnId: args.returnId,
        from: getAddress(args.from),
        hub: getAddress(args.hub),
        personId: args.personId,
        seller: getAddress(args.seller),
        amount: args.amount,
        destChainId: args.destChainId,
      };
    } catch {
      continue;
    }
  }
  return null;
}
