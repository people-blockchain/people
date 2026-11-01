import { NextResponse } from "next/server";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { clientIpFromRequest } from "@/lib/request-client-ip";
import { isWalletQuestComplete } from "@/lib/founders/quest/service";

export const dynamic = "force-dynamic";

const RATE_NAMESPACE = "founders-quest-check";
const RATE_MAX = 60;
const RATE_WINDOW_MS = 60_000;

export async function GET(request: Request) {
  const ip = clientIpFromRequest(request);
  if (!(await checkSharedRateLimit(RATE_NAMESPACE, ip, RATE_MAX, RATE_WINDOW_MS))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const url = new URL(request.url);
  const wallet = url.searchParams.get("wallet")?.trim() ?? "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ result: 0 });
  }
  const complete = await isWalletQuestComplete(wallet);
  return NextResponse.json({ result: complete ? 1 : 0 });
}
