import { ensurePartnerSchema } from "@/db";
import { completeTurnkeyEmailOtp } from "@/lib/turnkey-otp";
import { NextResponse } from "next/server";
import { mapTurnkeyError, NO_STORE, requireTurnkeySession } from "../../_shared";

export async function POST(request: Request) {
  const gate = await requireTurnkeySession(request);
  if (!gate.ok) return gate.response;
  let body: { otpId?: unknown; otpCode?: unknown; publicKey?: unknown } = {};
  try {
    body = (await request.json()) as { otpId?: unknown; otpCode?: unknown; publicKey?: unknown };
  } catch {
    return mapTurnkeyError(new Error("invalid_otp"));
  }
  try {
    await ensurePartnerSchema();
    const result = await completeTurnkeyEmailOtp({
      userId: gate.userId,
      otpId: typeof body.otpId === "string" ? body.otpId : "",
      otpCode: typeof body.otpCode === "string" ? body.otpCode : "",
      publicKey: typeof body.publicKey === "string" ? body.publicKey : "",
    });
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (err) {
    return mapTurnkeyError(err);
  }
}
