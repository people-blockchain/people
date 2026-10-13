import { NextResponse } from "next/server";
import { foundersApiGuard } from "@/lib/founders/api-guard";
import { getFounderByUserId } from "@/lib/founders/service";
import { createFounderPassportNonce } from "@/lib/founders/passport-wallet-nonce";
import { SITE_URL } from "@/lib/site";

export async function GET() {
  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;

  const founder = await getFounderByUserId(guard.userId);
  if (!founder) {
    return NextResponse.json({ error: "not_registered" }, { status: 403 });
  }

  const { nonce, issuedAt, expiresAt } = await createFounderPassportNonce(guard.userId);
  const domain = (process.env.AUTH_URL?.trim() || SITE_URL).replace(/^https?:\/\//, "");
  return NextResponse.json({
    nonce,
    domain,
    founderNumber: founder.founderNumber,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });
}
