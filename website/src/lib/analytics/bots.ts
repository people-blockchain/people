const BOT_UA_SUBSTRINGS = [
  "bot",
  "spider",
  "crawl",
  "slurp",
  "mediapartners",
  "facebookexternalhit",
  "bingpreview",
  "yandex",
  "baiduspider",
  "duckduckbot",
  "applebot",
  "semrush",
  "ahrefs",
  "mj12bot",
  "petalbot",
  "gptbot",
  "claudebot",
  "bytespider",
  "headlesschrome",
  "phantomjs",
  "slimerjs",
  "selenium",
  "webdriver",
  "puppeteer",
  "playwright",
  "lighthouse",
];

export type BotVerdict = { isBot: boolean; reason?: string };

export function detectBot(userAgent: string | null | undefined, hints?: { webdriver?: boolean }): BotVerdict {
  const ua = (userAgent ?? "").trim();
  if (!ua) {
    return { isBot: true, reason: "empty_ua" };
  }
  const lower = ua.toLowerCase();
  for (const needle of BOT_UA_SUBSTRINGS) {
    if (lower.includes(needle)) {
      return { isBot: true, reason: needle };
    }
  }
  if (hints?.webdriver) {
    return { isBot: true, reason: "webdriver" };
  }
  if (/headless/i.test(ua)) {
    return { isBot: true, reason: "headless" };
  }
  return { isBot: false };
}
