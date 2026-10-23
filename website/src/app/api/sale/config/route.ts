import { NextResponse } from "next/server";
import { PAY_FROM_OTHER_CHAINS, SALE, SELL_BACK } from "@/lib/sale/config";
import { getBaseSaleNetwork } from "@/lib/sale/sale-hub";
import { totalDeliveredSoldPpl } from "@/lib/sale/service";
import { BONDING_CURVE, bondingCurvePriceUsdt } from "@/lib/tokenomics";
import { SALE_MAX_USDT } from "@/lib/sale/economics";

export async function GET() {
  const sold = await totalDeliveredSoldPpl();
  const base = getBaseSaleNetwork();
  return NextResponse.json({
    soldPpl: sold,
    supplyPpl: BONDING_CURVE.supplyPpl,
    spotUsdt: bondingCurvePriceUsdt(sold),
    minUsdt: SALE.minPerBuyUsd,
    saleTermMonths: SALE.saleTermMonths,
    sellBack: SELL_BACK,
    payFromOtherChains: PAY_FROM_OTHER_CHAINS,
    maxUsdt: SALE_MAX_USDT,
    hub: {
      id: base.id,
      label: base.label,
      chainId: base.chainId,
      enabled: base.enabled,
      stables: base.stables,
      saleContract: base.evm.saleContract,
    },
  });
}
