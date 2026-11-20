import { desc, eq } from "drizzle-orm";
import { getDbReady } from "@/db";
import { supportMessages, supportThreads } from "@/db/schema";
import type { SupportReplyRole, SupportThreadStatus } from "./validation";

export type SupportThreadRow = typeof supportThreads.$inferSelect;
export type SupportMessageRow = typeof supportMessages.$inferSelect;

const MAX_MESSAGES = 200;
const MAX_THREADS = 100;

export async function getThreadForUser(userId: string): Promise<SupportThreadRow | null> {
  const db = await getDbReady();
  const [thread] = await db
    .select()
    .from(supportThreads)
    .where(eq(supportThreads.userId, userId))
    .orderBy(desc(supportThreads.lastMessageAt))
    .limit(1);
  return thread ?? null;
}

/** Latest messages of a thread, oldest first. */
export async function listMessages(threadId: string): Promise<SupportMessageRow[]> {
  const db = await getDbReady();
  const rows = await db
    .select()
    .from(supportMessages)
    .where(eq(supportMessages.threadId, threadId))
    .orderBy(desc(supportMessages.createdAt))
    .limit(MAX_MESSAGES);
  return rows.reverse();
}

/** Stores a user message, creating the thread on first use and re-opening a closed one. */
export async function addUserMessage(
  user: { id: string; email?: string | null },
  text: string,
): Promise<{ thread: SupportThreadRow; message: SupportMessageRow }> {
  const db = await getDbReady();
  const now = new Date();
  let thread = await getThreadForUser(user.id);
  if (!thread) {
    [thread] = await db
      .insert(supportThreads)
      .values({ userId: user.id, userEmail: user.email ?? null, status: "open", lastMessageAt: now })
      .returning();
  }
  const [message] = await db
    .insert(supportMessages)
    .values({ threadId: thread.id, senderRole: "user", senderName: null, body: text, createdAt: now })
    .returning();
  const [updated] = await db
    .update(supportThreads)
    .set({
      lastMessageAt: now,
      updatedAt: now,
      status: thread.status === "closed" ? "open" : thread.status,
    })
    .where(eq(supportThreads.id, thread.id))
    .returning();
  return { thread: updated ?? thread, message };
}

export async function listThreadsForAdmin(
  status: SupportThreadStatus | "all",
): Promise<SupportThreadRow[]> {
  const db = await getDbReady();
  const base = db.select().from(supportThreads);
  const filtered = status === "all" ? base : base.where(eq(supportThreads.status, status));
  return filtered.orderBy(desc(supportThreads.lastMessageAt)).limit(MAX_THREADS);
}

export async function getThreadWithMessages(
  threadId: string,
): Promise<{ thread: SupportThreadRow; messages: SupportMessageRow[] } | null> {
  const db = await getDbReady();
  const [thread] = await db.select().from(supportThreads).where(eq(supportThreads.id, threadId)).limit(1);
  if (!thread) return null;
  return { thread, messages: await listMessages(threadId) };
}

/** Adds a bot/agent reply and optionally moves the thread to a new status. */
export async function addReply(input: {
  threadId: string;
  text: string;
  senderRole: SupportReplyRole;
  senderName: string | null;
  status?: SupportThreadStatus;
}): Promise<{ thread: SupportThreadRow; message: SupportMessageRow } | null> {
  const db = await getDbReady();
  const [existing] = await db
    .select({ id: supportThreads.id })
    .from(supportThreads)
    .where(eq(supportThreads.id, input.threadId))
    .limit(1);
  if (!existing) return null;
  const now = new Date();
  const [message] = await db
    .insert(supportMessages)
    .values({
      threadId: input.threadId,
      senderRole: input.senderRole,
      senderName: input.senderName ?? (input.senderRole === "bot" ? "PEOPLE Support Bot" : "PEOPLE Support"),
      body: input.text,
      createdAt: now,
    })
    .returning();
  const [thread] = await db
    .update(supportThreads)
    .set({ lastMessageAt: now, updatedAt: now, ...(input.status ? { status: input.status } : {}) })
    .where(eq(supportThreads.id, input.threadId))
    .returning();
  return { thread, message };
}
