import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isDatabaseConfigured } from "@/db";
import { isVerifiedHuman } from "@/lib/discover/verified-human";
import { lavkaContractsReady } from "@/lib/lavka/contracts";
import { getMerchantByUserId, listProgramsForMerchant } from "@/lib/lavka/service";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ signedIn: false, verifiedHuman: false, contractsReady: lavkaContractsReady() });
  }
  const verifiedHuman = await isVerifiedHuman(userId);
  const merchant = verifiedHuman ? await getMerchantByUserId(userId) : null;
  const programs = merchant ? await listProgramsForMerchant(userId) : [];
  return NextResponse.json({
    signedIn: true,
    verifiedHuman,
    contractsReady: lavkaContractsReady(),
    merchant,
    programs,
  });
}
