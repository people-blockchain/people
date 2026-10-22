import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDbReady } from "@/db";
import { bugReports, founderTelegramUsers, telegramBotState } from "@/db/schema";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import {
  readTelegramVerifyBotToken,
  telegramVerifyWebhookSecret,
  TELEGRAM_VERIFY_BOT_USERNAME,
} from "@/lib/founders/telegram-bot";
import {
  DEFAULT_REWARD_POINTS,
  MAX_DESCRIPTION_LEN,
  MAX_SCREENSHOT_DATA_URL_LEN,
  type BugReportType,
  type BugStatus,
} from "./constants";
import {
  createBugReport,
  getBugReport,
  listBugReportsForAdmin,
  patchBugReportAsAdmin,
  type BugReportRow,
} from "./service";
import { getChatSiteLocale, pickLang, setChatSiteLocale, splitStartLocale } from "@/lib/telegram-lang";

/**
 * Support + bug intake through the verify bot (@PeopleVerifyBot), with owner triage in the
 * owner's private chat via inline buttons. The owner chat id comes from env
 * BUG_REPORTS_TELEGRAM_CHAT_ID, or (if unset) from the DB after the owner claims the bot with
 * `/start owner_<code>` (code from the admin-only /api/bugs/admin/telegram-owner link) or with
 * a plain /start from env OWNER_TELEGRAM_USERNAME. The first claim wins; later claims are refused.
 */

export type TgUser = { id: number; username?: string; first_name?: string; language_code?: string };
export type TgPhotoSize = { file_id: string; file_size?: number; width?: number; height?: number };
export type TgMessage = {
  message_id?: number;
  chat?: { id: number; type?: string };
  from?: TgUser;
  text?: string;
  caption?: string;
  photo?: TgPhotoSize[];
  document?: { file_id: string; mime_type?: string; file_size?: number };
  contact?: { phone_number?: string; user_id?: number };
};
export type TgCallbackQuery = { id: string; from: TgUser; data?: string; message?: TgMessage };

const OWNER_KEY = "owner_chat_id";
const awaitKey = (chatId: string) => `await:${chatId}`;
const OWNER_REPLY_KEY = "owner_reply_to";
export const ACTIONS = ["accept", "duplicate", "fixed", "reject", "reply"] as const;
type Action = (typeof ACTIONS)[number];
const ACTION_STATUS: Record<Exclude<Action, "reply">, BugStatus> = {
  accept: "accepted",
  duplicate: "duplicate",
  fixed: "fixed",
  reject: "rejected",
};

export const SUPPORT_LANGS = ["en", "ru", "ka", "hy", "tr", "uk"] as const;
export type Lang = (typeof SUPPORT_LANGS)[number];
type Msgs = {
  welcome: string;
  askSupport: string;
  askBug: string;
  received: (id: string) => string;
  rateLimited: string;
  tooLong: string;
  status: (id: string, s: BugStatus) => string;
  points: (n: number) => string;
  noAccount: string;
  reply: (id: string, text: string) => string;
  statusNames: Record<BugStatus, string>;
};
const sid = (id: string) => id.slice(0, 8);
export const T: Record<Lang, Msgs> = {
  en: {
    welcome:
      "Hi! This is PEOPLE Blockchain support.\n\n• /support <your question> — ask a question\n• /bug <what went wrong> — report a bug (you can attach a screenshot: send a photo with the text as caption)\n\nOr just send /support or /bug and then your message.",
    askSupport: "Please write your question in one message (you may attach a photo with a caption).",
    askBug: "Describe the bug in one message. Attach a screenshot as a photo with the description as its caption if you can.",
    received: (id) => `Thanks! Your request #${sid(id)} was received. We'll notify you here about its status.`,
    rateLimited: "Too many requests, please try again later.",
    tooLong: `Message is too long (max ${MAX_DESCRIPTION_LEN} characters).`,
    status: (id, s) => `Your request #${sid(id)} status: ${T.en.statusNames[s]}.`,
    points: (n) => `🎉 You were awarded ${n} season-0 points.`,
    noAccount: "To receive season-0 points, verify your account with this bot from the Founders page on the site.",
    reply: (id, text) => `💬 Reply to your request #${sid(id)}:\n\n${text}`,
    statusNames: { new: "new", accepted: "accepted", duplicate: "duplicate", fixed: "fixed", rejected: "rejected" },
  },
  ru: {
    welcome:
      "Здравствуйте! Это поддержка PEOPLE Blockchain.\n\n• /support <ваш вопрос> — задать вопрос\n• /bug <что сломалось> — сообщить об ошибке (можно приложить скриншот: отправьте фото с текстом в подписи)\n\nИли отправьте /support или /bug, а затем сообщение.",
    askSupport: "Напишите вопрос одним сообщением (можно фото с подписью).",
    askBug: "Опишите ошибку одним сообщением. Если можете — приложите скриншот как фото с описанием в подписи.",
    received: (id) => `Спасибо! Обращение #${sid(id)} получено. Мы сообщим здесь о его статусе.`,
    rateLimited: "Слишком много обращений, попробуйте позже.",
    tooLong: `Сообщение слишком длинное (максимум ${MAX_DESCRIPTION_LEN} символов).`,
    status: (id, s) => `Статус обращения #${sid(id)}: ${T.ru.statusNames[s]}.`,
    points: (n) => `🎉 Вам начислено ${n} очков сезона 0.`,
    noAccount: "Чтобы получать очки сезона 0, пройдите проверку аккаунта в этом боте со страницы Founders на сайте.",
    reply: (id, text) => `💬 Ответ на обращение #${sid(id)}:\n\n${text}`,
    statusNames: { new: "новое", accepted: "принято", duplicate: "дубликат", fixed: "исправлено", rejected: "отклонено" },
  },
  ka: {
    welcome:
      "გამარჯობა! ეს არის PEOPLE Blockchain-ის მხარდაჭერა.\n\n• /support <თქვენი კითხვა> — დასვით კითხვა\n• /bug <რა არ მუშაობს> — შეგვატყობინეთ შეცდომის შესახებ (შეგიძლიათ დაურთოთ სკრინშოტი: გამოგზავნეთ ფოტო ტექსტით წარწერაში)\n\nან უბრალოდ გამოგზავნეთ /support ან /bug და შემდეგ თქვენი შეტყობინება.",
    askSupport: "დაწერეთ თქვენი კითხვა ერთ შეტყობინებაში (შეგიძლიათ დაურთოთ ფოტო წარწერით).",
    askBug: "აღწერეთ შეცდომა ერთ შეტყობინებაში. თუ შეგიძლიათ, დაურთეთ სკრინშოტი ფოტოდ, აღწერით წარწერაში.",
    received: (id) => `გმადლობთ! თქვენი მიმართვა #${sid(id)} მიღებულია. სტატუსის შესახებ აქ შეგატყობინებთ.`,
    rateLimited: "ძალიან ბევრი მიმართვაა, სცადეთ მოგვიანებით.",
    tooLong: `შეტყობინება ძალიან გრძელია (მაქსიმუმ ${MAX_DESCRIPTION_LEN} სიმბოლო).`,
    status: (id, s) => `თქვენი მიმართვის #${sid(id)} სტატუსი: ${T.ka.statusNames[s]}.`,
    points: (n) => `🎉 დაგერიცხათ სეზონი 0-ის ${n} ქულა.`,
    noAccount: "სეზონი 0-ის ქულების მისაღებად გაიარეთ ანგარიშის ვერიფიკაცია ამ ბოტში საიტის Founders გვერდიდან.",
    reply: (id, text) => `💬 პასუხი თქვენს მიმართვაზე #${sid(id)}:\n\n${text}`,
    statusNames: { new: "ახალი", accepted: "მიღებულია", duplicate: "დუბლიკატი", fixed: "გამოსწორებულია", rejected: "უარყოფილია" },
  },
  hy: {
    welcome:
      "Բարև։ Սա PEOPLE Blockchain-ի աջակցությունն է։\n\n• /support <ձեր հարցը> — հարց տալ\n• /bug <ինչն է չաշխատում> — հաղորդել սխալի մասին (կարող եք կցել սքրինշոթ՝ ուղարկեք լուսանկար՝ տեքստը որպես մակագրություն)\n\nԿամ պարզապես ուղարկեք /support կամ /bug, ապա ձեր հաղորդագրությունը։",
    askSupport: "Գրեք ձեր հարցը մեկ հաղորդագրությամբ (կարող եք կցել լուսանկար՝ մակագրությամբ)։",
    askBug: "Նկարագրեք սխալը մեկ հաղորդագրությամբ։ Հնարավորության դեպքում կցեք սքրինշոթ՝ նկարագրությունը որպես մակագրություն։",
    received: (id) => `Շնորհակալություն։ Ձեր դիմումը #${sid(id)} ստացվել է։ Կտեղեկացնենք այստեղ դրա կարգավիճակի մասին։`,
    rateLimited: "Չափազանց շատ դիմումներ, խնդրում ենք փորձել ավելի ուշ։",
    tooLong: `Հաղորդագրությունը չափազանց երկար է (առավելագույնը ${MAX_DESCRIPTION_LEN} նիշ)։`,
    status: (id, s) => `Ձեր դիմումի #${sid(id)} կարգավիճակը՝ ${T.hy.statusNames[s]}։`,
    points: (n) => `🎉 Ձեզ շնորհվել է սեզոն 0-ի ${n} միավոր։`,
    noAccount: "Սեզոն 0-ի միավորներ ստանալու համար հաստատեք ձեր հաշիվը այս բոտում՝ կայքի Founders էջից։",
    reply: (id, text) => `💬 Պատասխան ձեր դիմումին #${sid(id)}՝\n\n${text}`,
    statusNames: { new: "նոր", accepted: "ընդունված", duplicate: "կրկնօրինակ", fixed: "ուղղված", rejected: "մերժված" },
  },
  tr: {
    welcome:
      "Merhaba! Burası PEOPLE Blockchain destek hattı.\n\n• /support <sorunuz> — soru sorun\n• /bug <ne bozuldu> — hata bildirin (ekran görüntüsü ekleyebilirsiniz: metni açıklama olarak yazıp fotoğraf gönderin)\n\nYa da sadece /support veya /bug gönderip ardından mesajınızı yazın.",
    askSupport: "Lütfen sorunuzu tek bir mesajda yazın (açıklamalı fotoğraf ekleyebilirsiniz).",
    askBug: "Hatayı tek bir mesajda açıklayın. Mümkünse açıklamayı fotoğraf altı yazısı olarak ekleyip ekran görüntüsü gönderin.",
    received: (id) => `Teşekkürler! #${sid(id)} numaralı talebiniz alındı. Durumu hakkında sizi burada bilgilendireceğiz.`,
    rateLimited: "Çok fazla talep, lütfen daha sonra tekrar deneyin.",
    tooLong: `Mesaj çok uzun (en fazla ${MAX_DESCRIPTION_LEN} karakter).`,
    status: (id, s) => `#${sid(id)} numaralı talebinizin durumu: ${T.tr.statusNames[s]}.`,
    points: (n) => `🎉 Size ${n} sezon-0 puanı verildi.`,
    noAccount: "Sezon-0 puanı almak için sitedeki Kurucular sayfasından bu botla hesabınızı doğrulayın.",
    reply: (id, text) => `💬 #${sid(id)} numaralı talebinize yanıt:\n\n${text}`,
    statusNames: { new: "yeni", accepted: "kabul edildi", duplicate: "yinelenen", fixed: "düzeltildi", rejected: "reddedildi" },
  },
  uk: {
    welcome:
      "Вітаємо! Це підтримка PEOPLE Blockchain.\n\n• /support <ваше питання> — поставити питання\n• /bug <що зламалося> — повідомити про помилку (можна додати скриншот: надішліть фото з текстом у підписі)\n\nАбо надішліть /support чи /bug, а потім повідомлення.",
    askSupport: "Напишіть питання одним повідомленням (можна фото з підписом).",
    askBug: "Опишіть помилку одним повідомленням. Якщо можете — додайте скриншот як фото з описом у підписі.",
    received: (id) => `Дякуємо! Звернення #${sid(id)} отримано. Ми повідомимо тут про його статус.`,
    rateLimited: "Забагато звернень, спробуйте пізніше.",
    tooLong: `Повідомлення задовге (максимум ${MAX_DESCRIPTION_LEN} символів).`,
    status: (id, s) => `Статус звернення #${sid(id)}: ${T.uk.statusNames[s]}.`,
    points: (n) => `🎉 Вам нараховано ${n} балів сезону 0.`,
    noAccount: "Щоб отримувати бали сезону 0, пройдіть перевірку акаунта в цьому боті зі сторінки Founders на сайті.",
    reply: (id, text) => `💬 Відповідь на звернення #${sid(id)}:\n\n${text}`,
    statusNames: { new: "нове", accepted: "прийнято", duplicate: "дублікат", fixed: "виправлено", rejected: "відхилено" },
  },
};
/**
 * `/verify` in the command menu. Verification itself starts on the site (Founders page issues a
 * one-time start code), so the bot points the user back there instead of faking a flow it cannot
 * complete on its own.
 */
const VERIFY_HINT: Record<Lang, string> = {
  en: "To verify your account, open the Founders page on the site and press “Verify with Telegram”. The link opens this bot and takes one tap.",
  ru: "Чтобы пройти проверку, откройте страницу основателей на сайте и нажмите «Подтвердить через Telegram». Ссылка откроет этого бота — дальше один тап.",
  ka: "ანგარიშის ვერიფიკაციისთვის გახსენით საიტზე დამფუძნებლების გვერდი და დააჭირეთ „ვერიფიკაცია Telegram-ით“. ბმული გახსნის ამ ბოტს — დარჩება ერთი შეხება.",
  hy: "Հաշիվը ստուգելու համար բացեք կայքի Հիմնադիրներ էջը և սեղմեք «Ստուգել Telegram-ով»։ Հղումը կբացի այս բոտը՝ մնում է մեկ հպում։",
  tr: "Hesabınızı doğrulamak için sitedeki Kurucular sayfasını açın ve «Telegram ile doğrula» düğmesine basın. Bağlantı bu botu açar; geriye tek dokunuş kalır.",
  uk: "Щоб пройти перевірку, відкрийте сторінку засновників на сайті та натисніть «Підтвердити через Telegram». Посилання відкриє цього бота — далі один тап.",
};

/** Reporter language: site locale (if any) first, then Telegram language_code, else English. */
export function supportLang(siteLocale?: string | null, languageCode?: string | null): Lang {
  return pickLang(SUPPORT_LANGS, siteLocale, languageCode);
}
const RU_STATUS = T.ru.statusNames;

export async function tgApi(method: string, body: Record<string, unknown> | FormData): Promise<unknown> {
  const token = readTelegramVerifyBotToken();
  if (!token) return null;
  const isForm = body instanceof FormData;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: isForm ? undefined : { "content-type": "application/json" },
    body: isForm ? body : JSON.stringify(body),
  });
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------- state ----------

async function getState(key: string): Promise<string | null> {
  const db = await getDbReady();
  const [row] = await db.select().from(telegramBotState).where(eq(telegramBotState.key, key)).limit(1);
  return row?.value ?? null;
}
async function setState(key: string, value: string): Promise<void> {
  const db = await getDbReady();
  await db
    .insert(telegramBotState)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: telegramBotState.key, set: { value, updatedAt: new Date() } });
}
async function clearState(key: string): Promise<void> {
  const db = await getDbReady();
  await db.delete(telegramBotState).where(eq(telegramBotState.key, key));
}

export async function getOwnerChatId(): Promise<string | null> {
  const env = process.env.BUG_REPORTS_TELEGRAM_CHAT_ID?.trim();
  if (env) return env;
  return getState(OWNER_KEY);
}

/** Deterministic one-time owner claim code; only exposed via the admin-only API route. */
export function ownerClaimCode(token: string): string {
  return createHmac("sha256", token).update("bug-reports-owner-claim").digest("hex").slice(0, 24);
}
export function ownerClaimDeepLink(): string | null {
  const token = readTelegramVerifyBotToken();
  if (!token) return null;
  return `https://t.me/${TELEGRAM_VERIFY_BOT_USERNAME}?start=owner_${ownerClaimCode(token)}`;
}
export function supportDeepLink(): string {
  return `https://t.me/${TELEGRAM_VERIFY_BOT_USERNAME}?start=support`;
}

/** Make sure the webhook also delivers callback_query (inline buttons). Keeps url + secret. */
async function ensureWebhookAllowsCallbacks(): Promise<void> {
  const token = readTelegramVerifyBotToken();
  if (!token) return;
  const info = (await tgApi("getWebhookInfo", {})) as {
    result?: { url?: string; allowed_updates?: string[] };
  } | null;
  const url = info?.result?.url;
  const allowed = info?.result?.allowed_updates;
  if (!url || !allowed || allowed.length === 0 || allowed.includes("callback_query")) return;
  await tgApi("setWebhook", {
    url,
    secret_token: telegramVerifyWebhookSecret(token),
    allowed_updates: Array.from(new Set([...allowed, "message", "callback_query"])),
  });
}

const OWNER_CLAIM_MIN_LEN = 24;
const ownerClaimUsedKey = (code: string) =>
  `owner_claim_used:${createHash("sha256").update(code).digest("hex").slice(0, 32)}`;

/** Constant-time match of `/start owner_<code>` against env OWNER_CLAIM_CODE (24+ chars). */
export function matchesEnvOwnerClaimCode(payload: string): string | null {
  const code = process.env.OWNER_CLAIM_CODE?.trim();
  if (!code || code.length < OWNER_CLAIM_MIN_LEN || !payload.startsWith("owner_")) return null;
  const a = createHash("sha256").update(payload.slice(6)).digest();
  const b = createHash("sha256").update(code).digest();
  return timingSafeEqual(a, b) ? code : null;
}

async function registerOwner(msg: TgMessage, chatId: number, text: string): Promise<void> {
  console.info(`[support-bot] owner chat registered: ${chatId} (@${msg.from?.username ?? "?"})`);
  await ensureWebhookAllowsCallbacks().catch(() => {});
  await tgApi("sendMessage", { chat_id: chatId, text });
}

async function tryClaimOwner(msg: TgMessage, payload: string): Promise<boolean> {
  const token = readTelegramVerifyBotToken();
  const chatId = msg.chat?.id;
  if (!token || chatId == null || msg.chat?.type && msg.chat.type !== "private") return false;

  // Env one-time claim: always wins (replaces any DB owner), then the code is burned in the DB.
  const envCode = matchesEnvOwnerClaimCode(payload);
  if (envCode) {
    const usedKey = ownerClaimUsedKey(envCode);
    if (await getState(usedKey)) {
      await tgApi("sendMessage", { chat_id: chatId, text: "Эта ссылка владельца уже использована." });
      return true;
    }
    await setState(usedKey, `${chatId}@${new Date().toISOString()}`);
    await setState(OWNER_KEY, String(chatId));
    await registerOwner(msg, chatId, "Готово, вы владелец: сюда будут приходить обращения и баги");
    return true;
  }

  const byCode = payload === `owner_${ownerClaimCode(token)}`;
  const ownerUser = process.env.OWNER_TELEGRAM_USERNAME?.trim().replace(/^@/, "").toLowerCase();
  const byUsername =
    !!ownerUser && !!msg.from?.username && msg.from.username.toLowerCase() === ownerUser && (payload === "" || payload === "support");
  if (!byCode && !byUsername) return false;

  const current = await getOwnerChatId();
  if (current && current !== String(chatId)) {
    await tgApi("sendMessage", { chat_id: chatId, text: "Чат владельца уже зарегистрирован." });
    return true;
  }
  if (!current) await setState(OWNER_KEY, String(chatId));
  await registerOwner(msg, chatId, `✅ Этот чат (id ${chatId}) теперь получает обращения и баг-репорты с кнопками разбора.`);
  return true;
}

// ---------- intake ----------

async function photoAsDataUrl(fileId: string): Promise<string | null> {
  const token = readTelegramVerifyBotToken();
  if (!token) return null;
  const info = (await tgApi("getFile", { file_id: fileId })) as { result?: { file_path?: string } } | null;
  const path = info?.result?.file_path;
  if (!path) return null;
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${path}`);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = path.endsWith(".png") ? "image/png" : path.endsWith(".webp") ? "image/webp" : "image/jpeg";
  const url = `data:${mime};base64,${buf.toString("base64")}`;
  return url.length <= MAX_SCREENSHOT_DATA_URL_LEN ? url : null;
}

function pickPhoto(msg: TgMessage): string | null {
  if (msg.photo?.length) {
    const fitting = msg.photo.filter((p) => (p.file_size ?? 0) <= 500_000);
    return (fitting.at(-1) ?? msg.photo[0]).file_id;
  }
  if (msg.document?.mime_type?.startsWith("image/")) return msg.document.file_id;
  return null;
}

async function linkedUserId(telegramUserId: number): Promise<string | null> {
  try {
    return await linkedUserIdUnsafe(telegramUserId);
  } catch {
    return null; // verification tables missing/unavailable: store the item without an account
  }
}

async function linkedUserIdUnsafe(telegramUserId: number): Promise<string | null> {
  const db = await getDbReady();
  const [row] = await db
    .select({ userId: founderTelegramUsers.userId })
    .from(founderTelegramUsers)
    .where(eq(founderTelegramUsers.telegramUserId, String(telegramUserId)))
    .limit(1);
  return row?.userId ?? null;
}

async function intake(msg: TgMessage, type: BugReportType, description: string): Promise<void> {
  const chatId = msg.chat!.id;
  const l = supportLang(await getChatSiteLocale(chatId), msg.from?.language_code);
  const key = String(msg.from?.id ?? chatId);
  if (
    !await checkSharedRateLimit("tg-support-hour", key, 5, 60 * 60 * 1000) ||
    !await checkSharedRateLimit("tg-support-day", key, 20, 24 * 60 * 60 * 1000)
  ) {
    await tgApi("sendMessage", { chat_id: chatId, text: T[l].rateLimited });
    return;
  }
  if (description.length > MAX_DESCRIPTION_LEN) {
    await tgApi("sendMessage", { chat_id: chatId, text: T[l].tooLong });
    return;
  }
  const photoId = pickPhoto(msg);
  const screenshotData = photoId ? await photoAsDataUrl(photoId).catch(() => null) : null;
  const userId = msg.from?.id != null ? await linkedUserId(msg.from.id) : null;
  const report = await createBugReport(
    userId,
    {
      description: description || "(photo without text)",
      screenshotData,
      context: { locale: l },
    },
    {
      type,
      source: "telegram",
      telegramChatId: String(chatId),
      telegramUsername: msg.from?.username ?? null,
      telegramPhotoFileId: photoId,
    },
  );
  await tgApi("sendMessage", { chat_id: chatId, text: T[l].received(report.id) });
  await notifyOwnerNewReport(report, { reporter: msg.from?.username ? `@${msg.from.username}` : msg.from?.first_name ?? `tg:${msg.from?.id}` });
}

// ---------- owner notify / triage ----------

export function triageKeyboard(id: string) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Принять", callback_data: `br:accept:${id}` },
        { text: "♻️ Дубликат", callback_data: `br:duplicate:${id}` },
        { text: "🛠 Исправлено", callback_data: `br:fixed:${id}` },
      ],
      [
        { text: "❌ Отклонить", callback_data: `br:reject:${id}` },
        { text: "💬 Ответить", callback_data: `br:reply:${id}` },
      ],
    ],
  };
}

export function ownerReportText(report: BugReportRow, reporter: string): string {
  const icon = report.type === "support" ? "❓" : "🐞";
  const kind = report.type === "support" ? "Вопрос в поддержку" : "Баг-репорт";
  const page = (report.context as { url?: string } | null)?.url;
  const desc = report.description.length > 600 ? `${report.description.slice(0, 600)}…` : report.description;
  return (
    `${icon} <b>${kind}</b> #${report.id.slice(0, 8)} (${report.source})\n` +
    `<b>От:</b> ${escapeHtml(reporter)}${report.userId ? "" : " (нет аккаунта на сайте)"}\n` +
    (page ? `<b>Страница:</b> ${escapeHtml(page)}\n` : "") +
    `<b>Язык:</b> ${(report.context as { locale?: string } | null)?.locale ?? "?"}\n<b>Статус:</b> ${RU_STATUS[report.status as BugStatus] ?? report.status}\n\n<i>${escapeHtml(desc)}</i>`
  );
}

/** Forwards a new item (site or Telegram) to the owner chat with triage buttons. Best effort. */
export async function notifyOwnerNewReport(report: BugReportRow, opts: { reporter: string }): Promise<void> {
  const chatId = await getOwnerChatId();
  if (!chatId || !readTelegramVerifyBotToken()) return;
  const text = ownerReportText(report, opts.reporter);
  const reply_markup = triageKeyboard(report.id);
  try {
    if (report.telegramPhotoFileId && text.length <= 1024) {
      await tgApi("sendPhoto", { chat_id: chatId, photo: report.telegramPhotoFileId, caption: text, parse_mode: "HTML", reply_markup });
      return;
    }
    if (report.screenshotData && text.length <= 1024) {
      const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(report.screenshotData);
      if (m) {
        const form = new FormData();
        form.append("chat_id", chatId);
        form.append("caption", text);
        form.append("parse_mode", "HTML");
        form.append("reply_markup", JSON.stringify(reply_markup));
        form.append("photo", new Blob([new Uint8Array(Buffer.from(m[2], "base64"))], { type: m[1] }), "screenshot.jpg");
        await tgApi("sendPhoto", form);
        return;
      }
    }
    await tgApi("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup });
  } catch (err) {
    console.error("[support-bot] owner notify failed:", err instanceof Error ? err.message : err);
  }
}

/** Tickets still needing a human. `accepted` is the site's "in progress"; `fixed` is "resolved". */
const OPEN_STATUSES: readonly BugStatus[] = ["new", "accepted"];
const CLOSED_STATUSES: readonly BugStatus[] = ["fixed", "rejected", "duplicate"];
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Daily digest of open tickets posted to the owner DM. Driven by the `daily-ticket-summary`
 * cron in vercel.json calling /api/telegram/daily-summary with CRON_SECRET. Returns the open count
 * even when the bot or the owner chat is not configured, so the cron route can report what happened.
 */
export async function sendDailyTicketSummary(now: Date = new Date()): Promise<{ open: number; sent: boolean }> {
  const reports = await listBugReportsForAdmin();
  const open = reports.filter((r) => OPEN_STATUSES.includes(r.status as BugStatus));
  const fresh = open.filter((r) => r.status === "new").length;
  const inProgress = open.filter((r) => r.status === "accepted").length;
  const since = now.getTime() - DAY_MS;
  const created = reports.filter((r) => r.createdAt.getTime() >= since).length;
  const closed = reports.filter(
    (r) => CLOSED_STATUSES.includes(r.status as BugStatus) && r.updatedAt.getTime() >= since,
  ).length;

  const owner = await getOwnerChatId();
  if (!owner || !readTelegramVerifyBotToken()) return { open: open.length, sent: false };

  const shown = open.slice(0, 15);
  const lines = shown.map((r) => {
    const ageDays = Math.max(0, Math.round((now.getTime() - r.createdAt.getTime()) / DAY_MS));
    const who = r.telegramUsername ? `@${escapeHtml(r.telegramUsername)}` : r.userId ? "site" : "tg";
    return `• #${r.id.slice(0, 8)} ${r.type === "support" ? "❓" : "🐞"} ${who} · ${ageDays} дн.`;
  });
  const text =
    `🗂 <b>Обращения за сутки</b> (${now.toISOString().slice(0, 10)})\n` +
    `Открыто: <b>${open.length}</b> (новых ${fresh}, в работе ${inProgress})\n` +
    `Новых за 24 ч: ${created} · закрыто за 24 ч: ${closed}\n` +
    (lines.length ? `\n${lines.join("\n")}` : "\nОткрытых обращений нет.") +
    (open.length > shown.length ? `\n…и ещё ${open.length - shown.length}` : "");
  await tgApi("sendMessage", { chat_id: owner, text, parse_mode: "HTML", disable_web_page_preview: true }).catch(
    () => {},
  );
  return { open: open.length, sent: true };
}

/** Telegram chat to DM the reporter: the bot chat for Telegram items, else a verified TG link. */
async function reporterChatId(report: BugReportRow): Promise<string | null> {
  if (report.telegramChatId) return report.telegramChatId;
  if (!report.userId) return null;
  try {
    const db = await getDbReady();
    const [row] = await db
      .select({ tg: founderTelegramUsers.telegramUserId })
      .from(founderTelegramUsers)
      .where(eq(founderTelegramUsers.userId, report.userId))
      .limit(1);
    return row?.tg ?? null;
  } catch {
    return null;
  }
}

/** DM the reporter about a status change (+ points). Used by bot buttons and the admin PATCH. */
export async function notifyReporterStatus(report: BugReportRow, credited: number): Promise<void> {
  const chatId = await reporterChatId(report);
  if (!chatId || !readTelegramVerifyBotToken()) return;
  const l: Lang = supportLang((report.context as { locale?: string } | null)?.locale);
  let text = T[l].status(report.id, report.status as BugStatus);
  if (credited > 0) text += `\n${T[l].points(credited)}`;
  else if (!report.userId && (report.status === "accepted" || report.status === "fixed")) text += `\n${T[l].noAccount}`;
  await tgApi("sendMessage", { chat_id: chatId, text }).catch(() => {});
}

async function handleCallback(cb: TgCallbackQuery): Promise<void> {
  const owner = await getOwnerChatId();
  const m = /^br:([a-z]+):([0-9a-f-]{36})$/.exec(cb.data ?? "");
  if (!owner || String(cb.from.id) !== owner || !m || !(ACTIONS as readonly string[]).includes(m[1])) {
    await tgApi("answerCallbackQuery", { callback_query_id: cb.id, text: "Нет доступа" });
    return;
  }
  const action = m[1] as Action;
  const id = m[2];
  if (action === "reply") {
    await setState(OWNER_REPLY_KEY, id);
    await tgApi("answerCallbackQuery", { callback_query_id: cb.id });
    await tgApi("sendMessage", {
      chat_id: owner,
      text: `Напишите ответ на #${id.slice(0, 8)} (следующее сообщение уйдёт пользователю). /cancel — отмена.`,
      reply_markup: { force_reply: true },
    });
    return;
  }
  const existing = await getBugReport(id);
  if (!existing) {
    await tgApi("answerCallbackQuery", { callback_query_id: cb.id, text: "Не найдено" });
    return;
  }
  const status = ACTION_STATUS[action];
  const rewardPoints =
    (status === "accepted" || status === "fixed") && existing.rewardPoints === 0
      ? DEFAULT_REWARD_POINTS[(existing.type as BugReportType) ?? "bug"] ?? 0
      : undefined;
  const result = await patchBugReportAsAdmin(id, { status, rewardPoints });
  if (!result.ok) {
    await tgApi("answerCallbackQuery", { callback_query_id: cb.id, text: result.error });
    return;
  }
  await tgApi("answerCallbackQuery", {
    callback_query_id: cb.id,
    text: `#${id.slice(0, 8)} → ${RU_STATUS[status]}${result.credited ? ` (+${result.credited} очк.)` : ""}`,
  });
  if (cb.message?.message_id && cb.message.chat?.id != null) {
    const line = `\n\n➡️ ${RU_STATUS[status]}${result.credited ? `, +${result.credited} очк.` : ""}`;
    const isPhoto = !!cb.message.photo?.length;
    const orig = (isPhoto ? cb.message.caption : cb.message.text) ?? "";
    await tgApi(isPhoto ? "editMessageCaption" : "editMessageText", {
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      ...(isPhoto ? { caption: (orig + line).slice(0, 1024) } : { text: (orig + line).slice(0, 4096) }),
      reply_markup: triageKeyboard(id),
    }).catch(() => {});
  }
  if (status !== existing.status || result.credited > 0) await notifyReporterStatus(result.report, result.credited);
}

async function handleOwnerReply(msg: TgMessage, text: string): Promise<boolean> {
  const id = await getState(OWNER_REPLY_KEY);
  if (!id) return false;
  await clearState(OWNER_REPLY_KEY);
  if (text === "/cancel") {
    await tgApi("sendMessage", { chat_id: msg.chat!.id, text: "Отменено." });
    return true;
  }
  const report = await getBugReport(id);
  const chatId = report ? await reporterChatId(report) : null;
  if (!report || !chatId) {
    await tgApi("sendMessage", { chat_id: msg.chat!.id, text: "У автора нет чата в Telegram, ответ не доставлен." });
    return true;
  }
  const l: Lang = supportLang((report.context as { locale?: string } | null)?.locale);
  await tgApi("sendMessage", { chat_id: chatId, text: T[l].reply(report.id, text.slice(0, 3500)) });
  const db = await getDbReady();
  const note = `${report.adminNote ? `${report.adminNote}\n` : ""}[reply ${new Date().toISOString()}] ${text}`.slice(0, 4000);
  await db.update(bugReports).set({ adminNote: note, updatedAt: new Date() }).where(eq(bugReports.id, id));
  await tgApi("sendMessage", { chat_id: msg.chat!.id, text: `Ответ отправлен на #${id.slice(0, 8)}.` });
  return true;
}

/**
 * Handles support/bug/owner updates. Returns true when consumed; false lets the existing
 * phone-verification flow handle it (founder /start <code> deep links and contact shares).
 */
export async function handleSupportBotUpdate(update: {
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}): Promise<boolean> {
  if (!readTelegramVerifyBotToken()) return false;
  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return true;
  }
  const msg = update.message;
  if (!msg?.chat?.id || msg.contact) return false;
  if (msg.chat.type && msg.chat.type !== "private") return true; // ignore groups
  const chatId = String(msg.chat.id);
  const raw = (msg.text ?? msg.caption ?? "").trim();
  let l = supportLang(await getChatSiteLocale(chatId), msg.from?.language_code);

  const start = /^\/start(?:@\w+)?(?:\s+(\S+))?/.exec(raw);
  if (start) {
    const payload = start[1] ?? "";
    if (await tryClaimOwner(msg, payload)) return true;
    const { base, siteLocale } = splitStartLocale(payload);
    if (payload === "" || ((base === "support" || base === "bug") && (siteLocale || base === payload))) {
      if (siteLocale) {
        await setChatSiteLocale(chatId, siteLocale);
        l = supportLang(siteLocale, msg.from?.language_code);
      }
      await clearState(awaitKey(chatId));
      await tgApi("sendMessage", { chat_id: chatId, text: T[l].welcome });
      return true;
    }
    return false; // founder verification deep link
  }

  const owner = await getOwnerChatId();
  if (owner === chatId && (await handleOwnerReply(msg, raw))) return true;

  const cmd = /^\/(support|bug|verify|help)(?:@\w+)?(?:\s+([\s\S]*))?$/.exec(raw);
  if (cmd) {
    if (cmd[1] === "help") {
      await tgApi("sendMessage", { chat_id: chatId, text: T[l].welcome });
      return true;
    }
    if (cmd[1] === "verify") {
      await tgApi("sendMessage", { chat_id: chatId, text: `${VERIFY_HINT[l]}\n\nhttps://www.peopleblockchain.network/founders` });
      return true;
    }
    const type: BugReportType = cmd[1] === "bug" ? "bug" : "support";
    const body = (cmd[2] ?? "").trim();
    if (!body && !pickPhoto(msg)) {
      await setState(awaitKey(chatId), type);
      await tgApi("sendMessage", { chat_id: chatId, text: type === "bug" ? T[l].askBug : T[l].askSupport });
      return true;
    }
    await clearState(awaitKey(chatId));
    await intake(msg, type, body);
    return true;
  }

  const awaiting = await getState(awaitKey(chatId));
  if (awaiting === "bug" || awaiting === "support") {
    if (!raw && !pickPhoto(msg)) return true;
    await clearState(awaitKey(chatId));
    await intake(msg, awaiting, raw);
    return true;
  }

  if (raw || pickPhoto(msg)) {
    await tgApi("sendMessage", { chat_id: chatId, text: T[l].welcome });
    return true;
  }
  return false;
}
