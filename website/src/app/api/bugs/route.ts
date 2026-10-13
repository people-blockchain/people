import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkSlidingWindowRateLimit } from "@/lib/api-rate-limit";
import { createBugReport, validateBugReportInput } from "@/lib/bug-reports/service";
import { notifyOwnerNewReport } from "@/lib/bug-reports/telegram-support-bot";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_PER_HOUR = 5;
const MAX_PER_DAY = 20;

/**
 * POST /api/bugs — submit a bug report (floating bug button). Auth required; rate-limited
 * per user (5/hour, 20/day) independent of the per-field size caps in validateBugReportInput.
 */
export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }

  if (!checkSlidingWindowRateLimit("bugs-submit-hour", userId, MAX_PER_HOUR, HOUR_MS)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  if (!checkSlidingWindowRateLimit("bugs-submit-day", userId, MAX_PER_DAY, DAY_MS)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const validated = validateBugReportInput((body ?? {}) as Record<string, unknown>);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const report = await createBugReport(userId, validated);

  // Forwarded to the owner's Telegram chat with triage buttons (same flow as bot DMs).
  await notifyOwnerNewReport(report, { reporter: session?.user?.email ?? userId }).catch(() => {});

  return NextResponse.json({ ok: true, id: report.id });
}
