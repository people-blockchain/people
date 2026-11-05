import { NextResponse } from "next/server";
import { isDiscoverAdmin } from "@/lib/discover/admin";
import { loadPartnersAdminOverview } from "@/lib/partner/admin-overview";
import { loadCabinet } from "@/lib/partner/service";

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
