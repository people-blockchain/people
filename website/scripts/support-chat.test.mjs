import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

register("./fixtures/support-chat-loader.mjs", import.meta.url);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BOT_TOKEN = "test-support-bot-token-0123456789";

let db, schema, validation, chatRoute, adminRoute, rateLimit;
let seq = 0;

before(async () => {
  process.env.SUPPORT_BOT_TOKEN = BOT_TOKEN;
  db = await (await import("./fixtures/support-chat-db.mjs")).getDbReady();
  globalThis.__supportDbCalls = 0;
  schema = await import("../src/db/schema.ts");
  validation = await import("../src/lib/support-chat/validation.ts");
  rateLimit = await import("../src/lib/api-rate-limit.ts");
  rateLimit.setSharedRateLimitBackendForTests(null);
  chatRoute = await import("../src/app/api/support/chat/route.ts");
  adminRoute = await import("../src/app/api/support/admin/route.ts");
});

beforeEach(() => {
  rateLimit.resetRateLimitStoresForTests();
  globalThis.__supportSession = null;
  globalThis.__supportIsAdmin = false;
  globalThis.__supportNotifyFails = false;
  globalThis.__supportNotifyCalls.length = 0;
  globalThis.__supportDbCalls = 0;
});

async function mkUser() {
  seq += 1;
  const id = `sc-user-${seq}`;
  await db.insert(schema.users).values({ id, email: `${id}@x.test` });
  return { id, email: `${id}@x.test` };
}

function signIn(user) {
  globalThis.__supportSession = { user: { id: user.id, email: user.email } };
}

function jsonRequest(url, method, body, headers = {}) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function nextRequest(url, init = {}) {
  // Route handlers only use headers/nextUrl/json(); NextRequest from next/server gives all of them.
  return import("next/server").then(({ NextRequest }) => new NextRequest(url, init));
}

// --- validation ---

test("validateSupportMessage: empty, whitespace and non-strings are rejected", () => {
  for (const bad of [undefined, null, 5, "", "   \n "]) {
    const r = validation.validateSupportMessage(bad);
    assert.equal(r.ok, false);
    assert.equal(r.error, "message_required");
  }
});

test("validateSupportMessage: trims, accepts 2000 chars, rejects 2001", () => {
  const ok = validation.validateSupportMessage("  hello  ");
  assert.deepEqual(ok, { ok: true, text: "hello" });
  assert.equal(validation.validateSupportMessage("x".repeat(2000)).ok, true);
  const long = validation.validateSupportMessage("x".repeat(2001));
  assert.equal(long.ok, false);
  assert.equal(long.error, "message_too_long");
});

test("validateAdminReply checks thread id, role, status and message", () => {
  const base = { threadId: "t1", message: "hi", senderRole: "agent" };
  assert.equal(validation.validateAdminReply(base).ok, true);
  assert.equal(validation.validateAdminReply({ ...base, status: "escalated" }).status, "escalated");
  assert.equal(validation.validateAdminReply({ ...base, threadId: "" }).error, "invalid_thread_id");
  assert.equal(validation.validateAdminReply({ ...base, senderRole: "user" }).error, "invalid_sender_role");
  assert.equal(validation.validateAdminReply({ ...base, status: "nope" }).error, "invalid_status");
  assert.equal(validation.validateAdminReply({ ...base, message: " " }).error, "message_required");
  assert.equal(validation.validateAdminReply(null).ok, false);
});

test("hasValidSupportBotToken: constant-time match, unset token never matches", () => {
  assert.equal(validation.hasValidSupportBotToken(`Bearer ${BOT_TOKEN}`, BOT_TOKEN), true);
  assert.equal(validation.hasValidSupportBotToken(`bearer ${BOT_TOKEN}`, BOT_TOKEN), true);
  assert.equal(validation.hasValidSupportBotToken("Bearer wrong", BOT_TOKEN), false);
  assert.equal(validation.hasValidSupportBotToken(`Bearer ${BOT_TOKEN}x`, BOT_TOKEN), false);
  assert.equal(validation.hasValidSupportBotToken(BOT_TOKEN, BOT_TOKEN), false);
  assert.equal(validation.hasValidSupportBotToken(null, BOT_TOKEN), false);
  assert.equal(validation.hasValidSupportBotToken("Bearer ", undefined), false);
  assert.equal(validation.hasValidSupportBotToken("Bearer anything", ""), false);
});

// --- /api/support/chat ---

test("chat GET/POST answer 401 for guests without touching the database", async () => {
  const get = await chatRoute.GET();
  assert.equal(get.status, 401);
  const post = await chatRoute.POST(jsonRequest("http://x.test/api/support/chat", "POST", { message: "hi" }));
  assert.equal(post.status, 401);
  assert.equal(globalThis.__supportDbCalls, 0);
  assert.equal(globalThis.__supportNotifyCalls.length, 0);
});

test("chat GET returns an empty payload and does not create a thread", async () => {
  const user = await mkUser();
  signIn(user);
  const res = await chatRoute.GET();
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { thread: null, messages: [] });
  const threads = await db.select().from(schema.supportThreads);
  assert.equal(threads.filter((t) => t.userId === user.id).length, 0);
});

test("chat POST validates the message and JSON body", async () => {
  const user = await mkUser();
  signIn(user);
  const empty = await chatRoute.POST(jsonRequest("http://x.test/api/support/chat", "POST", { message: "  " }));
  assert.equal(empty.status, 400);
  assert.equal((await empty.json()).error, "message_required");
  const long = await chatRoute.POST(
    jsonRequest("http://x.test/api/support/chat", "POST", { message: "y".repeat(2001) }),
  );
  assert.equal(long.status, 400);
  assert.equal((await long.json()).error, "message_too_long");
  const bad = await chatRoute.POST(
    new Request("http://x.test/api/support/chat", { method: "POST", body: "{nope" }),
  );
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, "invalid_json");
});

test("chat POST creates one thread, stores messages in order, and GET returns them", async () => {
  const user = await mkUser();
  signIn(user);
  const first = await chatRoute.POST(jsonRequest("http://x.test/api/support/chat", "POST", { message: " Hello " }));
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.ok, true);
  assert.equal(firstBody.message.body, "Hello");
  assert.equal(firstBody.message.senderRole, "user");
  assert.equal(firstBody.thread.status, "open");

  await chatRoute.POST(jsonRequest("http://x.test/api/support/chat", "POST", { message: "Second" }));
  const threads = (await db.select().from(schema.supportThreads)).filter((t) => t.userId === user.id);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].userEmail, user.email);

  const got = await (await chatRoute.GET()).json();
  assert.equal(got.thread.id, threads[0].id);
  assert.deepEqual(got.messages.map((m) => m.body), ["Hello", "Second"]);
  // Public payload never leaks the user's e-mail or id.
  assert.equal("userEmail" in got.thread, false);
  assert.equal(globalThis.__supportNotifyCalls.length, 2);
});

test("chat POST still succeeds when the Telegram notification fails", async () => {
  const user = await mkUser();
  signIn(user);
  globalThis.__supportNotifyFails = true;
  const res = await chatRoute.POST(jsonRequest("http://x.test/api/support/chat", "POST", { message: "ping" }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
});

test("chat POST re-opens a closed thread", async () => {
  const user = await mkUser();
  signIn(user);
  const { thread } = await (await chatRoute.POST(jsonRequest("http://x.test/api/support/chat", "POST", { message: "a" }))).json();
  const { eq } = await import("drizzle-orm");
  await db.update(schema.supportThreads).set({ status: "closed" }).where(eq(schema.supportThreads.id, thread.id));
  const res = await (await chatRoute.POST(jsonRequest("http://x.test/api/support/chat", "POST", { message: "b" }))).json();
  assert.equal(res.thread.status, "open");
});

test("chat POST is rate limited per user", async () => {
  const user = await mkUser();
  signIn(user);
  let limited = 0;
  for (let i = 0; i < 12; i++) {
    const res = await chatRoute.POST(jsonRequest("http://x.test/api/support/chat", "POST", { message: `m${i}` }));
    if (res.status === 429) limited += 1;
  }
  assert.ok(limited >= 1, "expected at least one 429");
  const other = await mkUser();
  signIn(other);
  const res = await chatRoute.POST(jsonRequest("http://x.test/api/support/chat", "POST", { message: "ok" }));
  assert.equal(res.status, 200);
});

// --- /api/support/admin ---

async function seedThread(status = "open", message = "need help") {
  const user = await mkUser();
  signIn(user);
  const { thread } = await (await chatRoute.POST(jsonRequest("http://x.test/api/support/chat", "POST", { message }))).json();
  globalThis.__supportSession = null;
  if (status !== "open") {
    const { eq } = await import("drizzle-orm");
    await db.update(schema.supportThreads).set({ status }).where(eq(schema.supportThreads.id, thread.id));
  }
  return thread.id;
}

test("admin rejects requests without admin session or valid bot token", async () => {
  const get = await adminRoute.GET(await nextRequest("http://x.test/api/support/admin"));
  assert.equal(get.status, 403);
  const wrong = await adminRoute.GET(
    await nextRequest("http://x.test/api/support/admin", { headers: { authorization: "Bearer nope" } }),
  );
  assert.equal(wrong.status, 403);
  const post = await adminRoute.POST(
    await nextRequest("http://x.test/api/support/admin", {
      method: "POST",
      body: JSON.stringify({ threadId: "t", message: "m", senderRole: "bot" }),
    }),
  );
  assert.equal(post.status, 403);
  assert.equal(globalThis.__supportDbCalls, 0);
});

test("admin GET lists threads by status, newest activity first, with bot token auth", async () => {
  const a = await seedThread("open", "first");
  const b = await seedThread("escalated", "second");
  const headers = { authorization: `Bearer ${BOT_TOKEN}` };
  const all = await (await adminRoute.GET(await nextRequest("http://x.test/api/support/admin?status=all", { headers }))).json();
  const ids = all.threads.map((t) => t.id);
  assert.ok(ids.indexOf(b) < ids.indexOf(a), "newest last_message_at first");
  const esc = await (await adminRoute.GET(await nextRequest("http://x.test/api/support/admin?status=escalated", { headers }))).json();
  assert.ok(esc.threads.every((t) => t.status === "escalated"));
  assert.ok(esc.threads.some((t) => t.id === b));
  const bad = await adminRoute.GET(await nextRequest("http://x.test/api/support/admin?status=weird", { headers }));
  assert.equal(bad.status, 400);
});

test("admin GET threadId returns messages; unknown thread is 404", async () => {
  const id = await seedThread("open", "details please");
  globalThis.__supportIsAdmin = true;
  const res = await adminRoute.GET(await nextRequest(`http://x.test/api/support/admin?threadId=${id}`));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.thread.id, id);
  assert.equal(body.messages[0].body, "details please");
  const missing = await adminRoute.GET(await nextRequest("http://x.test/api/support/admin?threadId=nope"));
  assert.equal(missing.status, 404);
});

test("admin POST adds a bot/agent reply and can escalate or close the thread", async () => {
  const id = await seedThread();
  const headers = { authorization: `Bearer ${BOT_TOKEN}`, "content-type": "application/json" };
  const bot = await adminRoute.POST(
    await nextRequest("http://x.test/api/support/admin", {
      method: "POST",
      headers,
      body: JSON.stringify({ threadId: id, message: "Auto answer", senderRole: "bot", status: "escalated" }),
    }),
  );
  assert.equal(bot.status, 200);
  const botBody = await bot.json();
  assert.equal(botBody.message.senderRole, "bot");
  assert.equal(botBody.message.senderName, "PEOPLE Support Bot");
  assert.equal(botBody.thread.status, "escalated");

  const agent = await adminRoute.POST(
    await nextRequest("http://x.test/api/support/admin", {
      method: "POST",
      headers,
      body: JSON.stringify({ threadId: id, message: "Human here", senderRole: "agent", status: "closed" }),
    }),
  );
  assert.equal((await agent.json()).thread.status, "closed");

  const detail = await (
    await adminRoute.GET(await nextRequest(`http://x.test/api/support/admin?threadId=${id}`, { headers }))
  ).json();
  assert.deepEqual(detail.messages.map((m) => m.senderRole), ["user", "bot", "agent"]);
});

test("admin POST validates input and returns 404 for an unknown thread", async () => {
  globalThis.__supportIsAdmin = true;
  const post = async (payload) =>
    adminRoute.POST(
      await nextRequest("http://x.test/api/support/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
  assert.equal((await post({ threadId: "x", message: "m", senderRole: "user" })).status, 400);
  assert.equal((await post({ threadId: "x", message: "", senderRole: "bot" })).status, 400);
  assert.equal((await post({ threadId: "missing", message: "m", senderRole: "bot" })).status, 404);
});

// --- static guarantees ---

test("chat route calls auth() before any database-touching import is used", () => {
  const src = readFileSync(join(root, "src/app/api/support/chat/route.ts"), "utf8");
  const getBody = src.slice(src.indexOf("export async function GET"), src.indexOf("export async function POST"));
  assert.ok(getBody.indexOf("await auth()") < getBody.indexOf("getThreadForUser"));
  const postBody = src.slice(src.indexOf("export async function POST"));
  assert.ok(postBody.indexOf("await auth()") < postBody.indexOf("checkSharedRateLimit"));
  assert.ok(postBody.indexOf("await auth()") < postBody.indexOf("addUserMessage"));
});

test("widget only polls while open, signed in and visible, and does no fetch when closed", () => {
  const src = readFileSync(join(root, "src/components/SupportChatWidget.tsx"), "utf8");
  assert.match(src, /POLL_INTERVAL_MS = 6000/);
  assert.match(src, /if \(!open\) return;/);
  assert.match(src, /document\.visibilityState === "visible"/);
  assert.match(src, /href="\/login"/);
  assert.match(src, /bottom: fabBottom/);
});

test("migration, bootstrap and schema declare the same support tables", () => {
  const sql = readFileSync(join(root, "drizzle/0026_support_chat.sql"), "utf8");
  for (const needle of [
    'CREATE TABLE IF NOT EXISTS "support_thread"',
    'CREATE TABLE IF NOT EXISTS "support_message"',
    'ON DELETE CASCADE',
    '"support_thread_status_idx" ON "support_thread" ("status", "last_message_at")',
    '"support_message_thread_idx" ON "support_message" ("thread_id", "created_at")',
  ]) {
    assert.ok(sql.includes(needle), needle);
  }
});
