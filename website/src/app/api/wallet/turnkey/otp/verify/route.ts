import { ensurePartnerSchema } from "@/db";
import { verifyTurnkeyEmailOtp } from "@/lib/turnkey-otp";
import { NextResponse } from "next/server";
import { mapTurnkeyError, NO_STORE, requireTurnkeySession } from "../../_shared";

export async function POST(request: Request) {
  const gate = await requireTurnkeySession(request);
  if (!gate.ok) return gate.response;
  let body: { otpId?: unknown; encryptedOtpBundle?: unknown; otpCode?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return mapTurnkeyError(new Error("invalid_otp"));
  }
  if (typeof body.otpCode === "string" && body.otpCode) {
    return mapTurnkeyError(new Error("invalid_otp"));
  }
  try {
    await ensurePartnerSchema();
    const result = await verifyTurnkeyEmailOtp({
      userId: gate.userId,
      otpId: typeof body.otpId === "string" ? body.otpId : "",
      encryptedOtpBundle: typeof body.encryptedOtpBundle === "string" ? body.encryptedOtpBundle : "",
    });
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (err) {
    return mapTurnkeyError(err);
  }
}
