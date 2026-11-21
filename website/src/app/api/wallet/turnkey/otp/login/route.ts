import { ensurePartnerSchema } from "@/db";
import { loginTurnkeyEmailOtp } from "@/lib/turnkey-otp";
import { turnkeyClientSignature } from "@/lib/turnkey-otp-message";
import { NextResponse } from "next/server";
import { mapTurnkeyError, NO_STORE, requireTurnkeySession } from "../../_shared";

export async function POST(request: Request) {
  const gate = await requireTurnkeySession(request);
  if (!gate.ok) return gate.response;
  let body: {
    verificationToken?: unknown;
    publicKey?: unknown;
    clientSignature?: {
      publicKey?: unknown;
      message?: unknown;
      signature?: unknown;
    };
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return mapTurnkeyError(new Error("invalid_otp"));
  }
  const sig = body.clientSignature;
  try {
    await ensurePartnerSchema();
    const result = await loginTurnkeyEmailOtp({
      userId: gate.userId,
      verificationToken: typeof body.verificationToken === "string" ? body.verificationToken : "",
      publicKey: typeof body.publicKey === "string" ? body.publicKey : "",
      clientSignature: turnkeyClientSignature({
        publicKey: typeof sig?.publicKey === "string" ? sig.publicKey : "",
        message: typeof sig?.message === "string" ? sig.message : "",
        signature: typeof sig?.signature === "string" ? sig.signature : "",
      }),
    });
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (err) {
    return mapTurnkeyError(err);
  }
}
