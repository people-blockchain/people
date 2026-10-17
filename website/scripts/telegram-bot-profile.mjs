#!/usr/bin/env node
/**
 * Set @PeopleVerifyBot's public profile — name, short description, about text and the command
 * menu — for every site locale, idempotently.
 *
 * The username stays `PeopleVerifyBot`; only the display profile changes. English is written as
 * the default (no `language_code`), the other 11 site locales with an explicit `language_code`.
 * Command *names* are the ASCII identifiers Telegram requires (`/verify`, `/support`, `/bug`);
 * their menu *descriptions* are translated.
 *
 * Usage (token comes from the site project's Vercel env — never commit or print it):
 *
 *   TELEGRAM_VERIFY_BOT_TOKEN='…' node scripts/telegram-bot-profile.mjs
 *   TELEGRAM_VERIFY_BOT_TOKEN='…' node scripts/telegram-bot-profile.mjs --verify-only
 *
 * Safe to re-run: every call is a set (idempotent) and the script prints the profile Telegram
 * actually holds afterwards (getMyName / getMyDescription / getMyShortDescription / getMyCommands)
 * for each locale. The token is never echoed, not even on failure.
 */
import { pathToFileURL } from "node:url";

/** The 12 site locales, in the order the site lists them. `en` is the default profile. */
export const SITE_LOCALES = ["en", "ru", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];

/** Menu order: Verify, Support, Report a bug. Names are fixed ASCII ids; only labels translate. */
export const COMMANDS = [
  { command: "verify", label: { en: "Verify", ru: "Проверка", es: "Verificar", pt: "Verificar", fr: "Vérifier", de: "Verifizieren", it: "Verifica", tr: "Doğrula", vi: "Xác minh", id: "Verifikasi", zh: "验证", ar: "التحقق" } },
  { command: "support", label: { en: "Support", ru: "Поддержка", es: "Ayuda", pt: "Ajuda", fr: "Assistance", de: "Hilfe", it: "Assistenza", tr: "Destek", vi: "Hỗ trợ", id: "Bantuan", zh: "帮助", ar: "الدعم" } },
  { command: "bug", label: { en: "Report a bug", ru: "Сообщить об ошибке", es: "Reportar un error", pt: "Reportar um erro", fr: "Signaler un bug", de: "Fehler melden", it: "Segnala un bug", tr: "Hata bildir", vi: "Báo lỗi", id: "Laporkan bug", zh: "报告错误", ar: "الإبلاغ عن خطأ" } },
];

/** One English display name for every language (default + all overrides) — never localized. */
export const BOT_NAME = "People Blockchain Helper";

/** Profile copy per locale. Telegram caps: name ≤64, short description ≤120, description ≤512. */
export const PROFILE = {
  en: {
    name: BOT_NAME,
    shortDescription: "Official PEOPLE Blockchain helper: verify, support, bug reports.",
    description:
      "Official helper bot of PEOPLE Blockchain. /verify — confirm you are a real person, /support — ask a question, /bug — report a bug. The bot answers in the language of the site page you came from, otherwise in your Telegram language, with English as fallback.",
  },
  ru: {
    name: BOT_NAME,
    shortDescription: "Официальный помощник PEOPLE Blockchain: проверка, поддержка, баги.",
    description:
      "Официальный бот-помощник PEOPLE Blockchain. /verify — подтвердить, что вы реальный человек, /support — задать вопрос, /bug — сообщить об ошибке. Бот отвечает на языке страницы сайта, с которой вы пришли, иначе на языке Telegram, с откатом на английский.",
  },
  es: {
    name: BOT_NAME,
    shortDescription: "Asistente oficial de PEOPLE Blockchain: verificar, soporte, errores.",
    description:
      "Bot asistente oficial de PEOPLE Blockchain. /verify — confirma que eres una persona real, /support — haz una pregunta, /bug — reporta un error. El bot responde en el idioma de la página del sitio desde la que llegaste; si no, en tu idioma de Telegram, con el inglés como reserva.",
  },
  pt: {
    name: BOT_NAME,
    shortDescription: "Assistente oficial da PEOPLE Blockchain: verificar, suporte, bugs.",
    description:
      "Bot assistente oficial da PEOPLE Blockchain. /verify — confirme que você é uma pessoa real, /support — faça uma pergunta, /bug — reporte um erro. O bot responde no idioma da página do site de onde você veio; caso contrário, no idioma do Telegram, com inglês como reserva.",
  },
  fr: {
    name: BOT_NAME,
    shortDescription: "Assistant officiel de PEOPLE Blockchain : vérifier, aide, bugs.",
    description:
      "Bot assistant officiel de PEOPLE Blockchain. /verify — confirmez que vous êtes une vraie personne, /support — posez une question, /bug — signalez un bug. Le bot répond dans la langue de la page du site d'où vous venez, sinon dans la langue de Telegram, avec l'anglais en secours.",
  },
  de: {
    name: BOT_NAME,
    shortDescription: "Offizieller Helfer von PEOPLE Blockchain: Prüfen, Hilfe, Fehler.",
    description:
      "Offizieller Helfer-Bot von PEOPLE Blockchain. /verify — bestätige, dass du ein echter Mensch bist, /support — stelle eine Frage, /bug — melde einen Fehler. Der Bot antwortet in der Sprache der aufgerufenen Website-Seite, sonst in deiner Telegram-Sprache, mit Englisch als Rückfall.",
  },
  it: {
    name: BOT_NAME,
    shortDescription: "Assistente ufficiale di PEOPLE Blockchain: verifica, supporto, bug.",
    description:
      "Bot assistente ufficiale di PEOPLE Blockchain. /verify — conferma di essere una persona reale, /support — fai una domanda, /bug — segnala un bug. Il bot risponde nella lingua della pagina del sito da cui sei arrivato, altrimenti nella lingua di Telegram, con l'inglese come riserva.",
  },
  tr: {
    name: BOT_NAME,
    shortDescription: "PEOPLE Blockchain resmî yardımcısı: doğrulama, destek, hata bildirimi.",
    description:
      "PEOPLE Blockchain'in resmî yardımcı botu. /verify — gerçek bir kişi olduğunuzu doğrulayın, /support — soru sorun, /bug — hata bildirin. Bot, geldiğiniz site sayfasının dilinde; yoksa Telegram dilinizde yanıtlar ve İngilizceye döner.",
  },
  vi: {
    name: BOT_NAME,
    shortDescription: "Trợ lý chính thức của PEOPLE Blockchain: xác minh, hỗ trợ, báo lỗi.",
    description:
      "Bot trợ lý chính thức của PEOPLE Blockchain. /verify — xác nhận bạn là người thật, /support — đặt câu hỏi, /bug — báo lỗi. Bot trả lời theo ngôn ngữ của trang web bạn đến từ đó, nếu không thì theo ngôn ngữ Telegram, dự phòng bằng tiếng Anh.",
  },
  id: {
    name: BOT_NAME,
    shortDescription: "Asisten resmi PEOPLE Blockchain: verifikasi, dukungan, laporkan bug.",
    description:
      "Bot asisten resmi PEOPLE Blockchain. /verify — pastikan Anda orang sungguhan, /support — ajukan pertanyaan, /bug — laporkan bug. Bot menjawab dalam bahasa halaman situs asal Anda, jika tidak dalam bahasa Telegram, dengan bahasa Inggris sebagai cadangan.",
  },
  zh: {
    name: BOT_NAME,
    shortDescription: "PEOPLE Blockchain 官方助手：验证、支持、报告错误。",
    description:
      "PEOPLE Blockchain 官方助手机器人。/verify —— 确认您是真人，/support —— 提问，/bug —— 报告错误。机器人会使用您来源网页的语言回复，否则使用您的 Telegram 语言，并回退到英语。",
  },
  ar: {
    name: BOT_NAME,
    shortDescription: "مساعد PEOPLE Blockchain الرسمي: التحقق والدعم والإبلاغ عن الأخطاء.",
    description:
      "بوت المساعدة الرسمي لـ PEOPLE Blockchain. /verify — أكّد أنك شخص حقيقي، /support — اطرح سؤالًا، /bug — أبلغ عن خطأ. يرد البوت بلغة صفحة الموقع التي أتيت منها، وإلا بلغة Telegram، مع الإنجليزية كخيار احتياطي.",
  },
};

/** The four `setMy*` calls Telegram needs for one locale (no `language_code` for the default). */
export function profileCalls(locale) {
  const p = PROFILE[locale];
  if (!p) throw new Error(`unknown locale: ${locale}`);
  const lang = locale === "en" ? undefined : { language_code: locale };
  const commands = COMMANDS.map((c) => ({ command: c.command, description: c.label[locale] }));
  return [
    { method: "setMyName", body: { name: p.name, ...lang } },
    { method: "setMyDescription", body: { description: p.description, ...lang } },
    { method: "setMyShortDescription", body: { short_description: p.shortDescription, ...lang } },
    { method: "setMyCommands", body: { commands, ...lang } },
  ];
}

/** Validation shared by the script and its test: every Telegram length/format cap holds. */
export function validateProfile() {
  const errors = [];
  for (const locale of SITE_LOCALES) {
    const p = PROFILE[locale];
    if (!p) {
      errors.push(`${locale}: missing profile`);
      continue;
    }
    if (!p.name || p.name.length > 64) errors.push(`${locale}: name must be 1..64 chars`);
    if (!p.shortDescription || p.shortDescription.length > 120) errors.push(`${locale}: short description must be 1..120 chars`);
    if (!p.description || p.description.length > 512) errors.push(`${locale}: description must be 1..512 chars`);
    for (const c of COMMANDS) {
      const label = c.label[locale];
      if (!label || label.length > 256) errors.push(`${locale}: command /${c.command} label must be 1..256 chars`);
    }
  }
  for (const c of COMMANDS) {
    if (!/^[a-z0-9_]{1,32}$/.test(c.command)) errors.push(`command name "${c.command}" is not a valid Telegram command`);
  }
  return errors;
}

export function readToken(env = process.env) {
  const token = env.TELEGRAM_VERIFY_BOT_TOKEN?.trim();
  return token || null;
}

async function tg(token, method, body, fetchImpl = fetch) {
  const res = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON reply */
  }
  return { ok: !!json?.ok, result: json?.result, description: json?.description };
}

/** Idempotent: writes the whole profile. Returns per-call results (never the token). */
export async function applyProfile(token, { fetchImpl = fetch } = {}) {
  const results = [];
  for (const locale of SITE_LOCALES) {
    for (const call of profileCalls(locale)) {
      const r = await tg(token, call.method, call.body, fetchImpl);
      results.push({ locale, method: call.method, ok: r.ok, description: r.description });
    }
  }
  return results;
}

/** Read back what Telegram stores, per locale — the verification step. */
export async function verifyProfile(token, { fetchImpl = fetch } = {}) {
  const out = [];
  for (const locale of SITE_LOCALES) {
    const lang = locale === "en" ? {} : { language_code: locale };
    const [name, commands] = await Promise.all([
      tg(token, "getMyName", lang, fetchImpl),
      tg(token, "getMyCommands", lang, fetchImpl),
    ]);
    out.push({
      locale,
      name: name.result?.name ?? null,
      commands: Array.isArray(commands.result) ? commands.result.map((c) => c.command) : [],
    });
  }
  return out;
}

async function main() {
  const token = readToken();
  if (!token) {
    console.error("TELEGRAM_VERIFY_BOT_TOKEN is not set");
    process.exit(1);
  }
  const problems = validateProfile();
  if (problems.length) {
    console.error("profile validation failed:");
    for (const p of problems) console.error(` - ${p}`);
    process.exit(1);
  }

  if (!process.argv.includes("--verify-only")) {
    const results = await applyProfile(token);
    const failed = results.filter((r) => !r.ok);
    console.log(`applied ${results.length} calls for ${SITE_LOCALES.length} locales (en = default)`);
    for (const f of failed) console.error(` - ${f.locale} ${f.method} failed: ${f.description ?? "unknown error"}`);
    if (failed.length) process.exit(1);
  }

  const verified = await verifyProfile(token);
  for (const row of verified) {
    const ok = row.name && row.commands.length === COMMANDS.length;
    console.log(`${ok ? "✓" : "✗"} ${row.locale.padEnd(3)} ${row.name ?? "(no name)"} · ${row.commands.join(", ") || "(no commands)"}`);
  }
  if (verified.some((row) => !row.name || row.commands.length !== COMMANDS.length)) process.exit(1);
  console.log("bot profile verified for all site locales");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("telegram-bot-profile failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
