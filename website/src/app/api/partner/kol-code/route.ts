import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensurePartnerSchema } from "@/db";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { partnerSharePath } from "@/lib/partner/referral";
import { claimKolCode } from "@/lib/partner/service";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await ensurePartnerSchema();
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!(await checkSharedRateLimit("partner_kol_code", session.user.id, 10, 10 * 60 * 1000))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let body: { kolCode?: string } = {};
  try {
    body = (await request.json()) as { kolCode?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await claimKolCode(session.user.id, body.kolCode);
  if (!result.ok) {
    const status = result.error === "kol_code_taken" ? 409 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  const origin = (process.env.AUTH_URL?.trim() || SITE_URL).replace(/\/$/, "");
  return NextResponse.json({
    ok: true,
    kolCode: result.kolCode,
    inviteLink: `${origin}${partnerSharePath(result.kolCode)}`,
  });
}
