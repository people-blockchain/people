import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { ensurePartnerSchema } from "@/db";
import { partnerSharePath, REFERRAL_COOKIE } from "@/lib/partner/referral";
import { attachReferralIfEligible, loadCabinet } from "@/lib/partner/service";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensurePartnerSchema();
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const rawCookie = cookieStore.get(REFERRAL_COOKIE)?.value;
  if (rawCookie) {
    try {
      await attachReferralIfEligible(session.user.id, rawCookie);
    } catch {
      /* ignore best-effort attach on GET */
    }
  }

  const cabinet = await loadCabinet(session.user.id);
  const origin = (process.env.AUTH_URL?.trim() || SITE_URL).replace(/\/$/, "");
  const activeCode = cabinet.kolCode ?? cabinet.referralCode;

  return NextResponse.json(
    {
      ok: true,
      cabinet: {
        ...cabinet,
        links: {
          inviteLink: `${origin}${partnerSharePath(activeCode)}`,
          defaultInviteLink: `${origin}${partnerSharePath(cabinet.referralCode)}`,
          kolInviteLink: cabinet.kolCode ? `${origin}${partnerSharePath(cabinet.kolCode)}` : null,
        },
      },
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    },
  );
}
