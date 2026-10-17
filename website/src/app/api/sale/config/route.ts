import { NextResponse } from "next/server";
import { LIFI_BRIDGE_SOURCE_CHAINS_EN } from "@/lib/sale/bridge";
import { getBaseSaleNetwork } from "@/lib/sale/sale-hub";
import { totalDeliveredSoldPpl } from "@/lib/sale/service";
import { BONDING_CURVE, bondingCurvePriceUsdt } from "@/lib/tokenomics";
import { SALE_MIN_USDT, SALE_MAX_USDT } from "@/lib/sale/economics";

export async function GET() {
  const sold = await totalDeliveredSoldPpl();
  const base = getBaseSaleNetwork();
  return NextResponse.json({
    soldPpl: sold,
    supplyPpl: BONDING_CURVE.supplyPpl,
    spotUsdt: bondingCurvePriceUsdt(sold),
    minUsdt: SALE_MIN_USDT,
    maxUsdt: SALE_MAX_USDT,
    hub: {
      id: base.id,
      label: base.label,
      chainId: base.chainId,
      enabled: base.enabled,
      stables: base.stables,
      saleContract: base.evm.saleContract,
    },
    bridgeSourceChains: LIFI_BRIDGE_SOURCE_CHAINS_EN,
  });
}
