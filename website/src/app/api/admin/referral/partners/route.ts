import { NextResponse } from "next/server";
import { isDiscoverAdmin } from "@/lib/discover/admin";
import { loadPartnersAdminOverview } from "@/lib/partner/admin-overview";
import { validateKolTierOverrideBps } from "@/lib/partner/admin-tier-override";
import { loadCabinet, setPartnerKolTierOverrideBps } from "@/lib/partner/service";

export async function GET() {
  if (!(await isDiscoverAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const overview = await loadPartnersAdminOverview();
  return NextResponse.json({ ok: true, ...overview });
}

export async function POST(request: Request) {
  if (!(await isDiscoverAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { userId?: string } | null;
  const userId = body?.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "missing_user_id" }, { status: 400 });
  }
  const detail = await loadCabinet(userId);
  return NextResponse.json({ ok: true, detail });
}

export async function PATCH(request: Request) {
  if (!(await isDiscoverAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as {
    userId?: string;
    kolTierOverrideBps?: number | null;
  } | null;
  const userId = body?.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "missing_user_id" }, { status: 400 });
  }
  const cabinet = await loadCabinet(userId);
  const volumeMicro = BigInt(cabinet.metrics.volumeUsdMicro || "0");
  const validation = validateKolTierOverrideBps(volumeMicro, body?.kolTierOverrideBps);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  await setPartnerKolTierOverrideBps(userId, validation.normalized);
  return NextResponse.json({ ok: true, kolTierOverrideBps: validation.normalized });
}
