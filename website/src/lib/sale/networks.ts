import saleEvm from "@/data/ppl-sale-evm.json" with { type: "json" };

export type SaleNetworkKind = "evm" | "tron" | "ton" | "solana";

export type SaleStable = "usdt" | "usdc";

export type SaleNetworkId =
  | "bsc"
  | "base"
  | "ethereum"
  | "polygon"
  | "tron"
  | "ton"
  | "solana";

export type SaleStableToken = {
  address: string;
  decimals: number;
};

export type SaleNetwork = {
  id: SaleNetworkId;
  kind: SaleNetworkKind;
  label: string;
  chainId?: number;
  enabled: boolean;
  pendingBadge: boolean;
  stables: SaleStable[];
  confirmations: number;
  receiverAddress?: string;
  evm?: {
    saleContract: string;
    usdt: SaleStableToken;
    usdc: SaleStableToken;
  };
  transfer?: {
    memoSupported: boolean;
  };
};

const DEFAULT_STABLE_TOKEN: SaleStableToken = { address: "", decimals: 6 };

const evmChains = saleEvm.chains as Record<
  string,
  { name: string; saleContract: string; usdt: SaleStableToken; usdc: SaleStableToken; confirmations: number }
>;

function evmNetwork(
  id: SaleNetworkId,
  chainId: number,
  stables: SaleStable[],
  saleContract: string
): SaleNetwork {
  const row = evmChains[String(chainId)];
  const contract = saleContract.trim();
  const enabled = contract.length > 0;
  return {
    id,
    kind: "evm",
    label: row?.name ?? id,
    chainId,
    enabled,
    pendingBadge: !enabled,
    stables,
    confirmations: row?.confirmations ?? 12,
    evm: {
      saleContract: contract,
      usdt: row?.usdt ?? DEFAULT_STABLE_TOKEN,
      usdc: row?.usdc ?? DEFAULT_STABLE_TOKEN,
    },
  };
}

export function saleReceiverFromEnv(networkId: SaleNetworkId): string | null {
  const map: Partial<Record<SaleNetworkId, string>> = {
    tron: "SALE_RECEIVER_TRON",
    ton: "SALE_RECEIVER_TON",
    solana: "SALE_RECEIVER_SOLANA",
  };
  const key = map[networkId];
  if (!key) return null;
  const v = process.env[key]?.trim();
  return v || null;
}

export function buildSaleNetworks(options?: { evmSaleContracts?: Partial<Record<SaleNetworkId, string>> }): SaleNetwork[] {
  const contracts = options?.evmSaleContracts ?? {};
  const tronAddr = saleReceiverFromEnv("tron");
  const tonAddr = saleReceiverFromEnv("ton");
  const solAddr = saleReceiverFromEnv("solana");

  const fromJson = (id: SaleNetworkId, chainId: number, stables: SaleStable[]) => {
    const row = evmChains[String(chainId)];
    const fromEnv =
      id === "bsc"
        ? process.env.SALE_CONTRACT_BSC
        : id === "base"
          ? process.env.SALE_CONTRACT_BASE
          : id === "ethereum"
            ? process.env.SALE_CONTRACT_ETHEREUM
            : id === "polygon"
              ? process.env.SALE_CONTRACT_POLYGON
              : undefined;
    const saleContract = (contracts[id] ?? fromEnv ?? row?.saleContract ?? "").trim();
    return evmNetwork(id, chainId, stables, saleContract);
  };

  return [
    fromJson("bsc", 56, ["usdt", "usdc"]),
    fromJson("base", 8453, ["usdc"]),
    fromJson("ethereum", 1, ["usdt", "usdc"]),
    fromJson("polygon", 137, ["usdt", "usdc"]),
    {
      id: "tron",
      kind: "tron",
      label: "Tron",
      enabled: Boolean(tronAddr),
      pendingBadge: !tronAddr,
      stables: ["usdt"],
      confirmations: 19,
      receiverAddress: tronAddr ?? undefined,
      transfer: { memoSupported: false },
    },
    {
      id: "ton",
      kind: "ton",
      label: "TON",
      enabled: Boolean(tonAddr),
      pendingBadge: !tonAddr,
      stables: ["usdt"],
      confirmations: 1,
      receiverAddress: tonAddr ?? undefined,
      transfer: { memoSupported: true },
    },
    {
      id: "solana",
      kind: "solana",
      label: "Solana",
      enabled: Boolean(solAddr),
      pendingBadge: !solAddr,
      stables: ["usdt", "usdc"],
      confirmations: 32,
      receiverAddress: solAddr ?? undefined,
      transfer: { memoSupported: true },
    },
  ];
}

export function getSaleNetwork(id: string, options?: { evmSaleContracts?: Partial<Record<SaleNetworkId, string>> }): SaleNetwork | undefined {
  return buildSaleNetworks(options).find((n) => n.id === id);
}

export const SALE_NETWORKS_LIST_EN =
  "BNB Chain, Base, Ethereum, Polygon, Tron, TON, Solana";
