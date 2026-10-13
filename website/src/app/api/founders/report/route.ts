import { NextResponse } from "next/server";
import { checkSlidingWindowRateLimit } from "@/lib/api-rate-limit";
import { clientIp } from "@/lib/discover/api-guard";
import { isDatabaseConfigured } from "@/db";
import { getMonthlyReport } from "@/lib/founders/transparency";

export const dynamic = "force-dynamic";

/** Monthly community report (`?month=YYYY-MM`, defaults to the current month). */
export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  if (!checkSlidingWindowRateLimit("founders-report", clientIp(request), 60, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const params = new URL(request.url).searchParams;
  const fallback = new Date().toISOString().slice(0, 7);
  const month = params.get("month") ?? fallback;
  try {
    const report = await getMonthlyReport(month);
    if (!report) return NextResponse.json({ error: "invalid_month" }, { status: 400 });
    return NextResponse.json({ report });
  } catch (error) {
    console.error("[founders/report]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
