import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LANGS = ["en", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar", "ru"];

const detect = await import("../src/lib/locale-detect.ts");
const share = await import("../src/lib/founders-share-text.ts");
const og = await import("../src/lib/og-meta.ts");

test("browser language detection maps tags to shipped locales", () => {
  assert.equal(detect.detectLanguage(["pt-BR", "en"]), "pt");
  assert.equal(detect.detectLanguage(["zh-Hans-CN"]), "zh");
  assert.equal(detect.detectLanguage(["in-ID"]), "id");
  assert.equal(detect.detectLanguage(["ja-JP", "de-AT"]), "de");
  assert.equal(detect.detectLanguage(["ja-JP"]), null);
  assert.equal(detect.detectLanguage(undefined), null);
});

test("Accept-Language is parsed by q-value and falls back to EN", () => {
  assert.deepEqual(detect.parseAcceptLanguage("fr;q=0.5, ru-RU, en;q=0.1, *;q=0.1"), ["ru-RU", "fr", "en"]);
  assert.equal(detect.languageFromAcceptLanguage("tr-TR,tr;q=0.9,en;q=0.8"), "tr");
  assert.equal(detect.languageFromAcceptLanguage("ja"), "en");
  assert.equal(detect.languageFromAcceptLanguage(null), "en");
});

test("founder share text exists for every locale, in that locale, with the number filled", () => {
  const seen = new Set();
  for (const lang of LANGS) {
    const mine = share.founderShareText(lang, 1234);
    assert.doesNotMatch(mine, /\{\{/, lang);
    assert.match(mine, /PEOPLE Blockchain/, lang);
    assert.ok(mine.includes((1234).toLocaleString(lang)), lang);
    seen.add(mine.replace((1234).toLocaleString(lang), "N"));
    assert.ok(share.founderShareText(lang, null).length > 10, lang);
  }
  assert.equal(seen.size, LANGS.length, "every locale has its own wording");
  assert.match(share.founderShareText("en", 7), /^I am Founder #7 of PEOPLE Blockchain\. Get your Founder Number:$/);
  assert.match(share.founderShareText("ru", 7), /основатель №7/);
});

test("share text follows the sharer's locale, not the recipient's", () => {
  assert.notEqual(share.founderShareText("de", 5), share.founderShareText("en", 5));
});

test("share link carries no locale and keeps ?ref= intact", () => {
  const wallet = "0x" + "ab".repeat(20);
  const url = share.founderShareUrl("https://www.peopleblockchain.network", wallet);
  assert.equal(url, `https://www.peopleblockchain.network/founders?ref=${wallet}`);
  assert.doesNotMatch(url, /lang|locale|\/(ru|de|es)\b/);
  assert.equal(share.founderShareUrl("https://x.test", null), "https://x.test/founders");
  assert.equal(share.founderShareUrl("", wallet), "");
});

test("the site has no locale redirects that could drop ?ref= (locale is detected client-side)", () => {
  const cfg = readFileSync(join(root, "next.config.ts"), "utf8");
  const proxy = readFileSync(join(root, "src/proxy.ts"), "utf8");
  assert.doesNotMatch(cfg, /\/(ru|de|es|fr)\b/);
  assert.doesNotMatch(proxy, /NextResponse\.redirect\([^)]*(lang|locale)/i);
});

test("OG metadata: absolute https 1200x630 image, canonical url without ref, twitter large card", () => {
  for (const page of ["home", "founders"]) {
    for (const lang of LANGS) {
      const m = og.buildPageMetadata(page, lang);
      const img = m.openGraph.images[0];
      assert.match(img.url, /^https:\/\//);
      assert.equal(img.width, 1200);
      assert.equal(img.height, 630);
      assert.match(m.openGraph.url, /^https:\/\/.+/);
      assert.doesNotMatch(m.openGraph.url, /\?/);
      assert.equal(m.openGraph.type, "website");
      assert.equal(m.twitter.card, "summary_large_image");
      assert.ok(m.openGraph.title && m.openGraph.description);
    }
  }
  assert.match(og.buildPageMetadata("founders", "ru").openGraph.description, /основател/i);
  assert.ok(og.buildPageMetadata("founders", "ru").openGraph.images[0].url.endsWith("/og-image-ru.jpg"));
});

test("OG images are under 300 KB", () => {
  for (const f of ["public/og-image.jpg", "public/og-image-ru.jpg", "src/app/opengraph-image.jpg", "src/app/twitter-image.jpg"]) {
    assert.ok(statSync(join(root, f)).size < 300 * 1024, f);
  }
});
