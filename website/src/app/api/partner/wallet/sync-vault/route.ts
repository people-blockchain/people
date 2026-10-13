import { auth } from "@/auth";
import { ensurePartnerSchema } from "@/db";
import { linkPartnerWalletFromVaultIfAbsent } from "@/lib/partner/service";
import { isAuthConfigured } from "@/lib/partner/guards";
import { NextResponse } from "next/server";

export async function POST() {
  if (!isAuthConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  await ensurePartnerSchema();
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await linkPartnerWalletFromVaultIfAbsent(session.user.id);
  if (!result.ok) {
    const status = result.error === "no_vault" ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, address: result.address, source: result.source });
}
