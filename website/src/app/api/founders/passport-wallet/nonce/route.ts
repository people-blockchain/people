import { NextResponse } from "next/server";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { clientIp } from "@/lib/discover/api-guard";
import { foundersApiGuard } from "@/lib/founders/api-guard";
import { getFounderByUserId } from "@/lib/founders/service";
import { createFounderPassportNonce } from "@/lib/founders/passport-wallet-nonce";
import { SITE_URL } from "@/lib/site";

export async function GET(request: Request) {
  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;

  const rateKey = `${guard.userId}:${clientIp(request)}`;
  if (!(await checkSharedRateLimit("founders-passport-nonce", rateKey, 30, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

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
