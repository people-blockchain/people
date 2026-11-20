import { ensurePartnerSchema } from "@/db";
import { initTurnkeyEmailOtp } from "@/lib/turnkey-otp";
import { NextResponse } from "next/server";
import { mapTurnkeyError, NO_STORE, requireTurnkeySession } from "../../_shared";

export async function POST(request: Request) {
  const gate = await requireTurnkeySession(request);
  if (!gate.ok) return gate.response;
  if (!gate.email) return mapTurnkeyError(new Error("invalid_email"));
  let body: { userIdentifier?: unknown } = {};
  try {
    body = (await request.json()) as { userIdentifier?: unknown };
  } catch {
    body = {};
  }
  try {
    await ensurePartnerSchema();
    const result = await initTurnkeyEmailOtp({
      userId: gate.userId,
      email: gate.email,
      userIdentifier: typeof body.userIdentifier === "string" ? body.userIdentifier : undefined,
    });
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (err) {
    return mapTurnkeyError(err);
  }
}
