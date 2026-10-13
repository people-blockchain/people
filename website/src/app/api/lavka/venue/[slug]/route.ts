import { NextResponse } from "next/server";
import { getMerchantBySlug, listProgramsForMerchant } from "@/lib/lavka/service";
import { lavkaContractsReady } from "@/lib/lavka/contracts";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const merchant = await getMerchantBySlug(slug);
  if (!merchant) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const programs = await listProgramsForMerchant(merchant.userId);
  return NextResponse.json({
    contractsReady: lavkaContractsReady(),
    merchant,
    programs,
  });
}
