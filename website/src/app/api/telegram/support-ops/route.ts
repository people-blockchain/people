import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  BUG_STATUSES,
  listBugReportsForAdmin,
  type BugReportRow,
  type BugStatus,
} from "@/lib/bug-reports/service";
import {
  OPEN_STATUSES,
  applySupportStatusAsAdmin,
  sendSupportReplyAsAdmin,
} from "@/lib/bug-reports/telegram-support-bot";

/**
 * GET/POST /api/telegram/support-ops — Bearer-protected ticket triage for PEOPLE Support
 * (Support Bot) without the Mac Helper UI or owner Telegram session. Fail closed when
 * TELEGRAM_SUPPORT_OPS_SECRET is unset.
 */
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

export function supportOpsSecret(): string | null {
  return process.env.TELEGRAM_SUPPORT_OPS_SECRET?.trim() || null;
}

/** Returns a 401 response when auth fails; null when the Bearer token matches. */
export function unauthorizedSupportOpsResponse(request: Request): NextResponse | null {
  const secret = supportOpsSecret();
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 401 });
  const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!safeEqual(auth, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}

const ACTION_STATUS: Record<string, BugStatus> = {
  accept: "accepted",
  duplicate: "duplicate",
  fixed: "fixed",
  reject: "rejected",
};

export function resolveSupportOpsStatus(input: string): BugStatus | null {
  const mapped = ACTION_STATUS[input];
  if (mapped) return mapped;
  if ((BUG_STATUSES as readonly string[]).includes(input)) return input as BugStatus;
  return null;
}

const LIST_DESC_MAX = 500;

export function ticketToSupportOpsListItem(report: BugReportRow) {
  const locale = (report.context as { locale?: string } | null)?.locale ?? null;
  const description =
    report.description.length > LIST_DESC_MAX
      ? `${report.description.slice(0, LIST_DESC_MAX)}…`
      : report.description;
  return {
    id: report.id,
    shortId: report.id.slice(0, 8),
    type: report.type,
    status: report.status,
    locale,
    description,
    createdAt: report.createdAt.toISOString(),
  };
}

export function parseSupportOpsSinceParam(sinceRaw: string | null): Date | null {
  const raw = sinceRaw?.trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(request: Request) {
  const denied = unauthorizedSupportOpsResponse(request);
  if (denied) return denied;
  const since = parseSupportOpsSinceParam(new URL(request.url).searchParams.get("since"));
  const reports = await listBugReportsForAdmin();
  let open = reports.filter((r) => OPEN_STATUSES.includes(r.status as BugStatus));
  if (since) open = open.filter((r) => r.createdAt >= since);
  return NextResponse.json(open.map(ticketToSupportOpsListItem));
}

export async function POST(request: Request) {
  const denied = unauthorizedSupportOpsResponse(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "";
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  if (action === "reply") {
    const text = typeof body?.text === "string" ? body.text : "";
    const result = await sendSupportReplyAsAdmin(id, text);
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ ok: true, id: result.report.id });
  }

  if (action === "status") {
    const raw = typeof body?.status === "string" ? body.status.trim() : "";
    const status = resolveSupportOpsStatus(raw);
    if (!status) return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    const result = await applySupportStatusAsAdmin(id, status);
    if (!result.ok) {
      const httpStatus = result.error === "not_found" ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status: httpStatus });
    }
    return NextResponse.json({
      ok: true,
      id: result.report.id,
      status: result.report.status,
      credited: result.credited,
    });
  }

  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}
