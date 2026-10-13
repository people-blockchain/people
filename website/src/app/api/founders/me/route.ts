import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isDatabaseConfigured } from "@/db";
import { isVerifiedHuman } from "@/lib/discover/verified-human";
import { getFounderDemoAirdropStatus } from "@/lib/founders/demo-airdrop";
import { getFounderByUserId } from "@/lib/founders/service";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({
      signedIn: false,
      verifiedHuman: false,
      founder: null,
    });
  }
  const verifiedHuman = await isVerifiedHuman(session.user.id);
  const founder = verifiedHuman ? await getFounderByUserId(session.user.id) : null;
  const demoAirdrop =
    founder && founder.verificationLevel >= 1
      ? await getFounderDemoAirdropStatus(session.user.id)
      : { state: "ineligible" as const };
  return NextResponse.json({
    signedIn: true,
    userId: session.user.id,
    verifiedHuman,
    founder,
    demoAirdrop,
  });
}
