import { ensurePartnerSchema } from "@/db";
import { getTurnkeyWalletStatus } from "@/lib/turnkey-suborg";
import { isTurnkeyWalletProvider } from "@/lib/wallet-provider-flag";
import { NextResponse } from "next/server";
import { jsonError, NO_STORE, requireTurnkeySession } from "../_shared";

export async function GET(request: Request) {
  if (!isTurnkeyWalletProvider()) {
    return NextResponse.json({ provider: "legacy" }, { headers: NO_STORE });
  }
  const gate = await requireTurnkeySession(request);
  if (!gate.ok) return gate.response;
  try {
    await ensurePartnerSchema();
    const status = await getTurnkeyWalletStatus(gate.userId);
    return NextResponse.json({ provider: "turnkey", ...status }, { headers: NO_STORE });
  } catch (err) {
    const code = err instanceof Error ? err.message : "status_failed";
    return jsonError(code === "turnkey_not_configured" ? "not_configured" : "status_failed", 502);
  }
}
