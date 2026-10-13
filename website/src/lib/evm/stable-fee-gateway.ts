/**
 * Client-side glue for the deployed `StableFeeGateway` (chain 97401,
 * `contracts/src/fees/StableFeeGateway.sol`). The gateway accepts a fixed USD stable fee
 * (tUSDC/tUSDT on testnet) for a token/NFT launch and routes 100% of it to the public PPL
 * buyback recipient. The PPL leg is not paid to the caller: since the C-01/S1-02 fix the
 * gateway credits the live PPL launch fee on the `TokenFactory`/`NftFactory` against the
 * payer's next `createToken`/`mint`, so the caller still calls the unchanged factory directly
 * to consume it — see `docs/design/buyback.md` §5, §8 for why this is a two-step flow instead
 * of one atomic call.
 *
 * Kept free of React so the address/fee-reading glue can be unit-tested in plain Node.
 */
import { getAddress, isAddress, zeroAddress, type Address } from "viem";
import gatewayData from "@/data/evm-stable-fee-gateway-97401.json" with { type: "json" };
import testStables from "@/data/evm-test-stables-97401.json" with { type: "json" };

export const GATEWAY_KIND = { TOKEN_LAUNCH: 0, NFT_MINT: 1 } as const;
export type GatewayKind = (typeof GATEWAY_KIND)[keyof typeof GATEWAY_KIND];

export const stableFeeGatewayAbi = [
  {
    type: "function",
    name: "payLaunchFee",
    stateMutability: "nonpayable",
    inputs: [
      { name: "kind", type: "uint8" },
      { name: "stable", type: "address" },
    ],
    outputs: [{ name: "pplAmount", type: "uint256" }],
  },
  {
    type: "function",
    name: "stableFeeUsd6",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint8" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "isAcceptedStable",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

export type StableAsset = {
  id: "tUSDC" | "tUSDT";
  symbol: string;
  address: Address;
  decimals: number;
};

type GatewayData = {
  address: string;
  acceptedStables: string[];
};

type TestStablesData = {
  tokens: Record<"tUSDC" | "tUSDT", { address: string; symbol: string; decimals: number }>;
};

const typedGateway = gatewayData as GatewayData;
const typedTestStables = testStables as TestStablesData;

/** The deployed gateway, or null when the data file's address is empty (not deployed yet). */
export function stableFeeGatewayAddress(): Address | null {
  const raw = typedGateway.address;
  if (!raw || !isAddress(raw)) return null;
  return getAddress(raw);
}

/**
 * Stables the gateway accepts, restricted to the data file's own `acceptedStables` list so a
 * future allowlist change on-chain doesn't silently offer an asset the gateway hasn't been told
 * about yet. Empty when the gateway isn't deployed.
 */
export function stableFeeAssets(): StableAsset[] {
  if (!stableFeeGatewayAddress()) return [];
  return typedGateway.acceptedStables
    .filter((id): id is "tUSDC" | "tUSDT" => id === "tUSDC" || id === "tUSDT")
    .map((id) => {
      const token = typedTestStables.tokens[id];
      return {
        id,
        symbol: token.symbol,
        address: (token.address || zeroAddress) as Address,
        decimals: token.decimals,
      };
    });
}
