import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { ensurePartnerSchema } from "@/db";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { clientIp } from "@/lib/discover/api-guard";
import { REFERRAL_COOKIE } from "@/lib/partner/referral";
import {
  attachReferralIfEligible,
  bindBuyerWalletForReferral,
} from "@/lib/partner/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await ensurePartnerSchema();
  const ip = clientIp(request);
  if (!(await checkSharedRateLimit("partner_ref_attach_ip", ip, 30, 10 * 60 * 1000))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let body: {
    refCookie?: string | null;
    buyerWallet?: string | null;
    peopleAddress?: string | null;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const cookieStore = await cookies();
  const rawCookie =
    cookieStore.get(REFERRAL_COOKIE)?.value ??
    body.refCookie ??
    null;

  const session = await auth();
  const userId = session?.user?.id ?? null;

  let attachResult: Awaited<ReturnType<typeof attachReferralIfEligible>> | null = null;
  if (userId && rawCookie) {
    try {
      attachResult = await attachReferralIfEligible(userId, rawCookie);
    } catch (error) {
      console.error(
        "[partner/referral/attach] attachReferralIfEligible failed",
        error instanceof Error ? error.name : typeof error,
      );
    }
  }

  let walletBound = false;
  if (body.buyerWallet) {
    try {
      const bound = await bindBuyerWalletForReferral({
        buyerWallet: body.buyerWallet,
        peopleAddress: body.peopleAddress ?? null,
        userId,
        rawCode: rawCookie,
      });
      walletBound = bound.ok;
    } catch (error) {
      console.error(
        "[partner/referral/attach] bindBuyerWalletForReferral failed",
        error instanceof Error ? error.name : typeof error,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    attached: attachResult?.attached ?? false,
    reason: attachResult && !attachResult.attached ? attachResult.reason : null,
    parentUserId: attachResult?.attached ? attachResult.parentUserId : null,
    referralCode: attachResult?.attached ? attachResult.referralCode : null,
    kolCode: attachResult?.attached ? attachResult.kolCode : null,
    walletBound,
  });
}
