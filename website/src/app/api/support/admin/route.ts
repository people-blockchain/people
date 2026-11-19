import { NextRequest, NextResponse } from "next/server";
import { isDiscoverAdmin } from "@/lib/discover/admin";
import {
  addReply,
  getThreadWithMessages,
  listThreadsForAdmin,
} from "@/lib/support-chat/service";
import {
  hasValidSupportBotToken,
  isSupportThreadStatus,
  validateAdminReply,
  type SupportThreadStatus,
} from "@/lib/support-chat/validation";

/** Admin session (same rule as /api/bugs/admin) or `Authorization: Bearer $SUPPORT_BOT_TOKEN`. */
async function isAuthorized(request: NextRequest): Promise<boolean> {
  if (hasValidSupportBotToken(request.headers.get("authorization"), process.env.SUPPORT_BOT_TOKEN)) {
    return true;
  }
  return isDiscoverAdmin();
}

/**
 * GET /api/support/admin?status=open|escalated|closed|all — thread list (newest activity first).
 * GET /api/support/admin?threadId=… — one thread with its messages.
 */
export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const params = request.nextUrl.searchParams;
  const threadId = params.get("threadId");
  if (threadId) {
    const found = await getThreadWithMessages(threadId);
    if (!found) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(found);
  }
  const statusParam = params.get("status") ?? "all";
  if (statusParam !== "all" && !isSupportThreadStatus(statusParam)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }
  const status: SupportThreadStatus | "all" = statusParam === "all" ? "all" : (statusParam as SupportThreadStatus);
  const threads = await listThreadsForAdmin(status);
  return NextResponse.json({ threads });
}

/** POST /api/support/admin — `{ threadId, message, senderRole: "bot"|"agent", status? }`. */
export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body: unknown = await request.json().catch(() => null);
  const validated = validateAdminReply(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const result = await addReply({
    threadId: validated.threadId,
    text: validated.text,
    senderRole: validated.senderRole,
    senderName: validated.senderName,
    status: validated.status,
  });
  if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, thread: result.thread, message: result.message });
}
