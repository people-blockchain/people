import { NextResponse } from "next/server";
import { lavkaApiGuard } from "@/lib/lavka/guard";
import { lavkaRateLimitAllowed } from "@/lib/lavka/api-rate-limit";
import { displayNameError } from "@/lib/lavka/limits";
import { upsertMerchant } from "@/lib/lavka/service";

export async function POST(request: Request) {
  const guard = await lavkaApiGuard();
  if (!guard.ok) return guard.response;
  if (!await lavkaRateLimitAllowed(guard.userId)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    displayName?: string;
    countryCode?: string;
  };
  const displayName = body.displayName?.trim() ?? "";
  const countryCode = body.countryCode?.trim() ?? "";
  const nameError = displayNameError(displayName);
  if (nameError) {
    return NextResponse.json({ error: nameError }, { status: 400 });
  }
  const result = await upsertMerchant({
    userId: guard.userId,
    displayName,
    countryRaw: countryCode,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ merchant: result.merchant });
}
