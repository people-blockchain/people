import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { addUserMessage, getThreadForUser, listMessages } from "@/lib/support-chat/service";
import { notifySupportMessage } from "@/lib/support-chat/notify";
import { validateSupportMessage } from "@/lib/support-chat/validation";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const MAX_PER_MINUTE = 8;
const MAX_PER_HOUR = 60;

function publicThread(t: { id: string; status: string; lastMessageAt: Date }) {
  return { id: t.id, status: t.status, lastMessageAt: t.lastMessageAt };
}

function publicMessage(m: { id: string; senderRole: string; senderName: string | null; body: string; createdAt: Date }) {
  return { id: m.id, senderRole: m.senderRole, senderName: m.senderName, body: m.body, createdAt: m.createdAt };
}

/**
 * GET /api/support/chat — the signed-in user's support thread and messages.
 * Guests get 401 before any database access, so the database can stay asleep for them.
 */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }
  const thread = await getThreadForUser(userId);
  if (!thread) {
    return NextResponse.json({ thread: null, messages: [] });
  }
  const messages = await listMessages(thread.id);
  return NextResponse.json({ thread: publicThread(thread), messages: messages.map(publicMessage) });
}

/** POST /api/support/chat — `{ message }`: add a user message (rate-limited, max 2000 chars). */
export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }

  if (!(await checkSharedRateLimit("support-chat-minute", userId, MAX_PER_MINUTE, MINUTE_MS))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  if (!(await checkSharedRateLimit("support-chat-hour", userId, MAX_PER_HOUR, HOUR_MS))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const raw = (body && typeof body === "object" ? (body as Record<string, unknown>).message : undefined);
  const validated = validateSupportMessage(raw);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const email = session?.user?.email ?? null;
  const { thread, message } = await addUserMessage({ id: userId, email }, validated.text);

  // Best effort: a failed Telegram ping must never fail the user's message.
  await notifySupportMessage({
    threadId: thread.id,
    from: email ?? userId,
    text: validated.text,
  }).catch(() => {});

  return NextResponse.json({ ok: true, thread: publicThread(thread), message: publicMessage(message) });
}
