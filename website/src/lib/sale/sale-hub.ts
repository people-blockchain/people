/**
 * Base-only sale hub configuration (PplCurveHub on Base).
 * Cross-chain funding uses the LI.FI widget on `/buy`, not per-chain sale contracts.
 */

import saleEvm from "@/data/ppl-sale-evm.json" with { type: "json" };
import { saleContractAddress } from "@/lib/sale/config";

export type SaleStable = "usdt" | "usdc";
export type SaleNetworkId = "base";

export type SaleStableToken = {
  address: string;
  decimals: number;
};

export type BaseSaleNetwork = {
  id: SaleNetworkId;
  label: string;
  chainId: number;
  enabled: boolean;
  stables: SaleStable[];
  confirmations: number;
  evm: {
    saleContract: string;
    usdt: SaleStableToken;
    usdc: SaleStableToken;
  };
};

const DEFAULT_STABLE: SaleStableToken = { address: "", decimals: 6 };

export function getBaseSaleNetwork(): BaseSaleNetwork {
  const chainId = 8453;
  const row = saleEvm.chains[String(chainId) as keyof typeof saleEvm.chains];
  const fromEnv = process.env.SALE_CONTRACT_BASE?.trim();
  const saleContract = (saleContractAddress() ?? fromEnv ?? row?.saleContract ?? "").trim();
  const enabled = saleContract.length > 0;
  return {
    id: "base",
    label: row?.name ?? "Base",
    chainId,
    enabled,
    stables: ["usdc", "usdt"],
    confirmations: row?.confirmations ?? 12,
    evm: {
      saleContract,
      usdt: row?.usdt ?? DEFAULT_STABLE,
      usdc: row?.usdc ?? DEFAULT_STABLE,
    },
  };
}

export function getSaleNetwork(id: string): BaseSaleNetwork | undefined {
  return id === "base" ? getBaseSaleNetwork() : undefined;
}
