import { NextResponse } from "next/server";
import { buildSaleNetworks } from "@/lib/sale/networks";
import { totalDeliveredSoldPpl } from "@/lib/sale/service";
import { BONDING_CURVE, bondingCurvePriceUsdt } from "@/lib/tokenomics";
import { SALE_MIN_USDT, SALE_MAX_USDT } from "@/lib/sale/economics";

export async function GET() {
  const sold = await totalDeliveredSoldPpl();
  const networks = buildSaleNetworks().map((n) => ({
    id: n.id,
    kind: n.kind,
    label: n.label,
    chainId: n.chainId,
    enabled: n.enabled,
    pendingBadge: n.pendingBadge,
    stables: n.stables,
    confirmations: n.confirmations,
    receiverAddress: n.receiverAddress,
    saleContract: n.evm?.saleContract ?? "",
  }));
  return NextResponse.json({
    soldPpl: sold,
    supplyPpl: BONDING_CURVE.supplyPpl,
    spotUsdt: bondingCurvePriceUsdt(sold),
    minUsdt: SALE_MIN_USDT,
    maxUsdt: SALE_MAX_USDT,
    networks,
  });
}
