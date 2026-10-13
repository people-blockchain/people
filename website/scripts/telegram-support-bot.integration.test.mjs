import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { eq } from "drizzle-orm";

register("./fixtures/bug-reports-db-loader.mjs", import.meta.url);

process.env.TELEGRAM_VERIFY_BOT_TOKEN = "123:TEST";
delete process.env.BUG_REPORTS_TELEGRAM_CHAT_ID;
process.env.OWNER_TELEGRAM_USERNAME = "AlexOwner";

let db, schema, bot, calls;
const OWNER = 9001;

before(async () => {
  const { getDbReady } = await import("./fixtures/bug-reports-pglite-db.mjs");
  db = await getDbReady();
  const { readFileSync } = await import("node:fs");
  const ddl = readFileSync(new URL("../drizzle/0010_founder_telegram_verify.sql", import.meta.url), "utf8");
  for (const st of ddl.split(";").map((x) => x.trim()).filter((x) => x && !x.startsWith("ALTER"))) {
    await db.$client.exec(st);
  }
  schema = await import("../src/db/schema.ts");
  bot = await import("../src/lib/bug-reports/telegram-support-bot.ts");
});

beforeEach(() => {
  calls = [];
  globalThis.fetch = async (url, init) => {
    const method = String(url).split("/").pop();
    const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : init?.body;
    calls.push({ method, body });
    if (method === "getWebhookInfo") {
      return new Response(JSON.stringify({ ok: true, result: { url: "https://x/api/telegram/verify-webhook", allowed_updates: ["message"] } }));
    }
    return new Response(JSON.stringify({ ok: true, result: {} }));
  };
});

const msg = (fromId, text, extra = {}) => ({
  message: { message_id: 1, chat: { id: fromId, type: "private" }, from: { id: fromId, username: `u${fromId}` }, text, ...extra },
});

test("founder verify deep links and contacts fall through to the verify flow", async () => {
  assert.equal(await bot.handleSupportBotUpdate(msg(5, "/start abc123code")), false);
  assert.equal(await bot.handleSupportBotUpdate({ message: { chat: { id: 5 }, from: { id: 5 }, contact: { phone_number: "+1", user_id: 5 } } }), false);
});

test("non-owner /start owner_<wrong> does not claim the owner chat", async () => {
  assert.equal(await bot.handleSupportBotUpdate(msg(6, "/start owner_deadbeef")), false);
  assert.equal(await bot.getOwnerChatId(), null);
});

test("owner claims via OWNER_TELEGRAM_USERNAME /start; webhook gains callback_query; second claim refused", async () => {
  const u = msg(OWNER, "/start");
  u.message.from.username = "alexowner";
  assert.equal(await bot.handleSupportBotUpdate(u), true);
  assert.equal(await bot.getOwnerChatId(), String(OWNER));
  const setHook = calls.find((c) => c.method === "setWebhook");
  assert.ok(setHook.body.allowed_updates.includes("callback_query"));
  assert.ok(!JSON.stringify(setHook.body).includes("123:TEST"));

  const other = msg(7, `/start owner_${bot.ownerClaimCode("123:TEST")}`);
  calls = [];
  assert.equal(await bot.handleSupportBotUpdate(other), true);
  assert.equal(await bot.getOwnerChatId(), String(OWNER));
  assert.match(calls[0].body.text, /уже зарегистрирован/);
});

test("/support <text> stores a support item and forwards it to the owner with buttons", async () => {
  await bot.handleSupportBotUpdate(msg(42, "/support How do I stake?"));
  const rows = await db.select().from(schema.bugReports).where(eq(schema.bugReports.telegramChatId, "42"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, "support");
  assert.equal(rows[0].source, "telegram");
  assert.equal(rows[0].userId, null);
  const toOwner = calls.find((c) => c.method === "sendMessage" && c.body.chat_id === String(OWNER));
  const buttons = toOwner.body.reply_markup.inline_keyboard.flat().map((b) => b.callback_data);
  assert.deepEqual(buttons, ["accept", "duplicate", "fixed", "reject", "reply"].map((a) => `br:${a}:${rows[0].id}`));
  assert.ok(calls.some((c) => c.method === "sendMessage" && c.body.chat_id === 42 && /received/.test(c.body.text)));
});

test("/bug then a photo with caption creates a bug with the photo forwarded", async () => {
  await bot.handleSupportBotUpdate(msg(43, "/bug"));
  await bot.handleSupportBotUpdate(msg(43, undefined, { caption: "Button broken", photo: [{ file_id: "PH1", file_size: 1000 }] }));
  const [row] = await db.select().from(schema.bugReports).where(eq(schema.bugReports.telegramChatId, "43"));
  assert.equal(row.type, "bug");
  assert.equal(row.description, "Button broken");
  assert.equal(row.telegramPhotoFileId, "PH1");
  assert.ok(calls.some((c) => c.method === "sendPhoto" && c.body.photo === "PH1" && c.body.chat_id === String(OWNER)));
});

test("Accept from a non-owner is refused; owner Accept credits linked founder once and DMs the user", async () => {
  await db.insert(schema.users).values({ id: "tgu1", email: "tgu1@x.test" });
  await db.insert(schema.founders).values({ userId: "tgu1", founderNumber: 777, countryCode: "GE", entryMultiplier: 1, totalPoints: 0, walletAddress: `0x${"7".repeat(40)}` });
  await db.insert(schema.founderTelegramUsers).values({ telegramUserId: "44", userId: "tgu1" });
  await bot.handleSupportBotUpdate(msg(44, "/bug Swap page crashes"));
  const [row] = await db.select().from(schema.bugReports).where(eq(schema.bugReports.telegramChatId, "44"));
  assert.equal(row.userId, "tgu1");

  await bot.handleSupportBotUpdate({ callback_query: { id: "c0", from: { id: 44 }, data: `br:accept:${row.id}` } });
  assert.equal((await db.select().from(schema.bugReports).where(eq(schema.bugReports.id, row.id)))[0].status, "new");

  calls = [];
  const cb = { id: "c1", from: { id: OWNER }, data: `br:accept:${row.id}`, message: { message_id: 9, chat: { id: OWNER }, text: "orig" } };
  await bot.handleSupportBotUpdate({ callback_query: cb });
  await bot.handleSupportBotUpdate({ callback_query: { ...cb, id: "c2", data: `br:fixed:${row.id}` } });
  const [after] = await db.select().from(schema.bugReports).where(eq(schema.bugReports.id, row.id));
  assert.equal(after.status, "fixed");
  assert.equal(after.rewardPoints, 100);
  const [f] = await db.select().from(schema.founders).where(eq(schema.founders.userId, "tgu1"));
  assert.equal(f.totalPoints, 100);
  const dms = calls.filter((c) => c.method === "sendMessage" && c.body.chat_id === "44");
  assert.match(dms[0].body.text, /accepted/);
  assert.match(dms[0].body.text, /100 season-0 points/);
  assert.match(dms[1].body.text, /fixed/);
});

test("Reply button: owner's next message is relayed to the reporter", async () => {
  await bot.handleSupportBotUpdate(msg(45, "/support where is my wallet?"));
  const [row] = await db.select().from(schema.bugReports).where(eq(schema.bugReports.telegramChatId, "45"));
  await bot.handleSupportBotUpdate({ callback_query: { id: "r1", from: { id: OWNER }, data: `br:reply:${row.id}` } });
  calls = [];
  await bot.handleSupportBotUpdate(msg(OWNER, "Open the Wallet tab."));
  const relay = calls.find((c) => c.method === "sendMessage" && c.body.chat_id === "45");
  assert.match(relay.body.text, /Open the Wallet tab\./);
  const [after] = await db.select().from(schema.bugReports).where(eq(schema.bugReports.id, row.id));
  assert.match(after.adminNote, /Open the Wallet tab/);
});

test("site bug-button reports are forwarded to the owner with buttons", async () => {
  await db.insert(schema.users).values({ id: "site1", email: "site1@x.test" });
  const svc = await import("../src/lib/bug-reports/service.ts");
  const report = await svc.createBugReport("site1", { description: "Footer overlaps", screenshotData: null, context: { url: "https://p/x" } });
  assert.equal(report.type, "bug");
  assert.equal(report.source, "site");
  calls = [];
  await bot.notifyOwnerNewReport(report, { reporter: "site1@x.test" });
  assert.equal(calls[0].body.chat_id, String(OWNER));
  assert.match(calls[0].body.text, /https:\/\/p\/x/);
  assert.ok(calls[0].body.reply_markup.inline_keyboard);
});

test("support deep link uses the verify bot", () => {
  assert.equal(bot.supportDeepLink(), "https://t.me/PeopleVerifyBot?start=support");
});

test("env OWNER_CLAIM_CODE: wrong code refused, right code replaces owner once, then burned", async () => {
  const code = "A".repeat(10) + "b".repeat(16);
  process.env.OWNER_CLAIM_CODE = code;
  try {
    assert.equal(await bot.handleSupportBotUpdate(msg(4242, "/start owner_" + "A".repeat(26))), false);
    assert.equal(await bot.handleSupportBotUpdate(msg(4242, `/start owner_${code}`)), true);
    assert.equal(await bot.getOwnerChatId(), "4242");
    assert.ok(calls.some((c) => c.method === "sendMessage" && /Готово, вы владелец/.test(c.body.text)));
    calls = [];
    assert.equal(await bot.handleSupportBotUpdate(msg(777, `/start owner_${code}`)), true);
    assert.equal(await bot.getOwnerChatId(), "4242");
    assert.ok(calls.some((c) => c.method === "sendMessage" && /уже использована/.test(c.body.text)));
  } finally {
    delete process.env.OWNER_CLAIM_CODE;
  }
});

// ---------- i18n: each user gets their own language ----------
let OWN2;
test("i18n setup: current owner chat", async () => { OWN2 = Number(await bot.getOwnerChatId()); assert.ok(OWN2); });

const umsg = (fromId, text, language_code, extra = {}) => ({
  message: { message_id: 1, chat: { id: fromId, type: "private" }, from: { id: fromId, username: `u${fromId}`, language_code }, text, ...extra },
});
const dmTo = (id) => calls.filter((c) => c.method === "sendMessage" && String(c.body.chat_id) === String(id)).map((c) => c.body.text);

const USERS = [
  [501, "ru", /Спасибо! Обращение/, /Статус обращения .*принято/],
  [502, "en", /Thanks! Your request/, /status: accepted/],
  [503, "ka", /გმადლობთ/, /სტატუსი: მიღებულია/],
  [504, "hy", /Շնորհակալություն/, /կարգավիճակը՝ ընդունված/],
  [505, "tr", /Teşekkürler/, /durumu: kabul edildi/],
  [506, "uk", /Дякуємо! Звернення/, /Статус звернення .*прийнято/],
  [507, "de", /Thanks! Your request/, /status: accepted/],
  [508, undefined, /Thanks! Your request/, /status: accepted/],
  [509, "kk", /Спасибо! Обращение/, /Статус обращения .*принято/],
];

test("interleaved users each get their own language; later status DMs use stored language; owner sees Russian", async () => {
  calls = [];
  // interleave: everyone opens /bug first, then everyone sends the text (catches any shared state)
  for (const [id, lc] of USERS) await bot.handleSupportBotUpdate(umsg(id, "/bug", lc));
  for (const [id, lc] of USERS) await bot.handleSupportBotUpdate(umsg(id, `broken for ${id}`, lc));
  const owner = calls.filter((c) => c.body?.chat_id === String(OWN2)).map((c) => c.body.text ?? c.body.caption);
  for (const t of owner) assert.match(t, /Баг-репорт/);
  for (const [id, , rx] of USERS) {
    const texts = dmTo(id);
    assert.equal(texts.length, 2, `user ${id} got ${texts.length}`);
    for (const t of texts) {
      for (const [other, , orx] of USERS) if (orx.source !== rx.source && other !== id) assert.doesNotMatch(t, orx);
    }
    assert.match(texts[1], rx);
  }
  // later status update, in reverse order, with no language info on the callback
  const rows = await db.select().from(schema.bugReports);
  for (const [id, , , srx] of [...USERS].reverse()) {
    const row = rows.find((r) => r.telegramChatId === String(id));
    calls = [];
    await bot.handleSupportBotUpdate({ callback_query: { id: `s${id}`, from: { id: OWN2, language_code: "en" }, data: `br:accept:${row.id}` } });
    assert.match(dmTo(id)[0], srx);
    const ack = calls.find((c) => c.method === "answerCallbackQuery");
    assert.match(ack.body.text, /принято/);
  }
});

test("site locale via support deep link beats Telegram language_code and is remembered per user", async () => {
  calls = [];
  await bot.handleSupportBotUpdate(umsg(601, "/start support_ka", "ru"));
  await bot.handleSupportBotUpdate(umsg(602, "/start support_hy", "en"));
  await bot.handleSupportBotUpdate(umsg(603, "/start support_de", "uk")); // unsupported site locale -> tg code
  await bot.handleSupportBotUpdate(umsg(604, "/start support_es", "fr")); // neither -> English
  assert.match(dmTo(601)[0], /გამარჯობა/);
  assert.match(dmTo(602)[0], /Բարև/);
  assert.match(dmTo(603)[0], /Вітаємо/);
  assert.match(dmTo(604)[0], /^Hi!/);
  calls = [];
  await bot.handleSupportBotUpdate(umsg(601, "/support вопрос", "ru"));
  await bot.handleSupportBotUpdate(umsg(602, "/support q", "en"));
  assert.match(dmTo(601)[0], /გმადლობთ/);
  assert.match(dmTo(602)[0], /Շնորհակալություն/);
  const [r601] = await db.select().from(schema.bugReports).where(eq(schema.bugReports.telegramChatId, "601"));
  assert.equal(r601.context.locale, "ka");
  calls = [];
  await bot.handleSupportBotUpdate({ callback_query: { id: "x601", from: { id: OWN2 }, data: `br:reject:${r601.id}` } });
  assert.match(dmTo(601)[0], /უარყოფილია/);
});

test("site bug-button report: status DM uses the site locale, owner text in Russian", async () => {
  await db.insert(schema.users).values({ id: "site2", email: "site2@x.test" });
  await db.insert(schema.founderTelegramUsers).values({ telegramUserId: "701", userId: "site2" });
  const svc = await import("../src/lib/bug-reports/service.ts");
  const report = await svc.createBugReport("site2", { description: "x", screenshotData: null, context: { url: "https://p/y", locale: "tr" } });
  calls = [];
  await bot.notifyOwnerNewReport(report, { reporter: "site2@x.test" });
  assert.match(calls[0].body.text, /Баг-репорт.*\n.*От:/s);
  assert.match(calls[0].body.text, /Язык:<\/b> tr/);
  await bot.handleSupportBotUpdate({ callback_query: { id: "t701", from: { id: OWN2 }, data: `br:fixed:${report.id}` } });
  assert.match(dmTo(701).at(-1), /durumu: düzeltildi/);
});

test("language resolution: site > tg > en; Russian only for ru/CIS", async () => {
  const L = bot.supportLang;
  assert.equal(L(null, "de"), "en");
  assert.equal(L(null, undefined), "en");
  assert.equal(L("ka", "ru"), "ka");
  assert.equal(L("pt", "hy"), "hy");
  assert.equal(L(null, "be"), "ru");
  assert.equal(L(null, "uz-Cyrl"), "ru");
  assert.equal(L(null, "uz"), "en");
  assert.equal(L(null, "pt-BR"), "en");
  const { supportUrlWithLocale } = await import("../src/lib/support-url.ts");
  assert.equal(supportUrlWithLocale("https://t.me/PeopleVerifyBot?start=support", "ka"), "https://t.me/PeopleVerifyBot?start=support_ka");
});

test("/verify menu command points back to the Founders page, in the user's language", async () => {
  calls = [];
  await bot.handleSupportBotUpdate(umsg(901, "/verify", "en"));
  await bot.handleSupportBotUpdate(umsg(902, "/verify", "ru"));
  assert.match(dmTo(901)[0], /Founders page/);
  assert.match(dmTo(901)[0], /peopleblockchain\.network\/founders/);
  assert.match(dmTo(902)[0], /основателей/);
});

test("daily summary DMs the owner the open-ticket counts", async () => {
  calls = [];
  const res = await bot.sendDailyTicketSummary(new Date("2026-10-12T07:00:00.000Z"));
  assert.equal(res.sent, true);
  assert.ok(res.open >= 1);
  const dm = calls.find((c) => c.method === "sendMessage" && String(c.body.chat_id) === String(OWN2));
  assert.ok(dm, "no digest sent to the owner chat");
  assert.match(dm.body.text, /Обращения за сутки/);
  assert.match(dm.body.text, /Открыто: <b>\d+<\/b>/);
  assert.match(dm.body.text, /Новых за 24 ч: \d+/);
});

test("verify deep link `<code>_<site locale>`: prompt + later replies in site locale; bare code still works", async () => {
  await db.$client.exec(`ALTER TABLE "founder_telegram_chat" ADD COLUMN IF NOT EXISTS "startCode" text`);
  const sc = await import("../src/lib/founders/telegram-start-code.ts");
  const vw = await import("../src/lib/founders/telegram-verify-webhook.ts");
  await db.insert(schema.users).values([{ id: "v1", email: "v1@x.test" }, { id: "v2", email: "v2@x.test" }, { id: "v3", email: "v3@x.test" }]);
  const c1 = await sc.createFounderTelegramStartCode("v1");
  const c2 = await sc.createFounderTelegramStartCode("v2");
  const c3 = await sc.createFounderTelegramStartCode("v3");
  calls = [];
  const up = (id, text, lc, extra = {}) => ({ message: { chat: { id }, from: { id, language_code: lc }, text, ...extra } });
  assert.equal(await bot.handleSupportBotUpdate(up(801, `/start ${c1}_ka`, "ru")), false);
  await vw.handleTelegramVerifyUpdate(up(801, `/start ${c1}_ka`, "ru"));
  await vw.handleTelegramVerifyUpdate(up(802, `/start ${c2}_de`, "ru")); // verify bot supports de
  await vw.handleTelegramVerifyUpdate(up(803, `/start ${c3}`, "hy")); // old bare link -> tg code
  assert.match(dmTo(801)[0], /ნომრის გაზიარება/);
  assert.match(dmTo(802)[0], /Nummer teilen/);
  assert.match(dmTo(803)[0], /Կիսվել համարով/);
  calls = [];
  // someone else's contact: reply still in the stored site locale
  await vw.handleTelegramVerifyUpdate(up(801, undefined, "ru", { contact: { phone_number: "+995", user_id: 999 } }));
  assert.match(dmTo(801)[0], /გააზიარეთ საკუთარი ნომერი/);
});
