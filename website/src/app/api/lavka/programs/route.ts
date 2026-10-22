import { NextResponse } from "next/server";
import { lavkaApiGuard } from "@/lib/lavka/guard";
import { lavkaRateLimitAllowed } from "@/lib/lavka/api-rate-limit";
import { programTitleError } from "@/lib/lavka/limits";
import { getMerchantByUserId, registerProgram } from "@/lib/lavka/service";

export async function POST(request: Request) {
  const guard = await lavkaApiGuard();
  if (!guard.ok) return guard.response;
  if (!await lavkaRateLimitAllowed(guard.userId)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const merchant = await getMerchantByUserId(guard.userId);
  if (!merchant) {
    return NextResponse.json({ error: "merchant_required" }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    createTxHash?: string;
  };
  const title = body.title?.trim() ?? "";
  const titleError = programTitleError(title);
  if (titleError) {
    return NextResponse.json({ error: titleError }, { status: 400 });
  }
  const createTxHash = body.createTxHash?.trim() ?? "";
  if (!/^0x[a-fA-F0-9]{64}$/.test(createTxHash)) {
    return NextResponse.json({ error: "invalid_tx_hash" }, { status: 400 });
  }
  const result = await registerProgram({
    merchantUserId: guard.userId,
    title,
    createTxHash,
  });
  if (!result.ok) {
    const status =
      result.error === "not_program_owner"
        ? 403
        : result.error === "program_already_registered"
          ? 409
          : result.error === "merchant_missing"
            ? 400
            : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ program: result.program });
}
