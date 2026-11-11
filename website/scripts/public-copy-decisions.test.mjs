/**
 * Guards for already-decided public copy (owner decisions 2026-11-01 … 2026-11-10):
 *  - no public Russian locale and no `ru` autodetection;
 *  - meta / og headline states only the guaranteed 10% (decision B), never "up to 27%";
 *  - the header "Mainnet" hint does not read as "Mainnet = Base";
 *  - sold-back PPL return to the sale wallet (nothing is burned) and sell-back stays open
 *    until the reserve moves to liquidity, not "closes after graduation";
 *  - mainnet / sale dates are fixed; ~1,000 verified participants gate transfers only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => readFileSync(join(root, ...parts), "utf8");
const surface = (name, lang) => JSON.parse(read("src", "lib", "locales", "surfaces", `${name}-${lang}.json`));
const PUBLIC = ["en", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];
const CYRILLIC = /[\u0400-\u04FF]/;

const detect = await import("../src/lib/locale-detect.ts");
const languages = await import("../src/lib/languages.ts");
const site = await import("../src/lib/site.ts");

test("ru is not a public locale and is never autodetected", () => {
  assert.deepEqual([...detect.PUBLIC_LANGUAGE_CODES].sort(), [...PUBLIC].sort());
  assert.ok(!languages.AVAILABLE_LANGUAGE_CODES.includes("ru"), "switcher must not offer ru");
  assert.deepEqual([...languages.AVAILABLE_LANGUAGE_CODES].sort(), [...PUBLIC].sort());
  assert.equal(detect.detectLanguage(["ru-RU", "ru"]), null);
  assert.equal(detect.detectLanguage(["ru-RU", "de"]), "de");
  assert.equal(detect.languageFromAcceptLanguage("ru-RU,ru;q=0.9"), "en");
  assert.equal(detect.languageFromCookie("ru"), null);
  for (const option of languages.CATALOGUE) assert.doesNotMatch(option.endonym, CYRILLIC, option.code);
  const prefs = read("src", "lib", "preferences.ts");
  assert.match(prefs, /new Set<Language>\(PUBLIC_LANGUAGE_CODES\)/, "stored ru preference is ignored");
});

test("the admin telegram-owner landing is English only", () => {
  assert.doesNotMatch(read("src", "app", "admin", "telegram-owner", "page.tsx"), CYRILLIC);
});

test("meta / og headline copy states the guaranteed 10% and never 'up to 27%'", () => {
  for (const value of [site.SITE_DESCRIPTION, site.SITE_OG_DESCRIPTION, site.SITE_TITLE, site.SITE_OG_TITLE]) {
    assert.doesNotMatch(value, /27\s?%/, value);
  }
  assert.match(site.SITE_DESCRIPTION, /10% of every new token .*guaranteed/);
  assert.match(site.SITE_OG_DESCRIPTION, /10% of every new token .*guaranteed/);
  for (const lang of PUBLIC) {
    for (const [key, value] of Object.entries(site.DOCUMENT_TITLES[lang])) {
      assert.doesNotMatch(value, /27\s?%/, `${lang}.${key}`);
    }
  }
});

test("header Mainnet hint: sale on Base, PPL on PEOPLE mainnet", () => {
  for (const lang of PUBLIC) {
    const source = read("src", "lib", "locales", `${lang}.ts`);
    const hint = /"mainnetTitle":\s*"([^"]+)"/.exec(source)?.[1];
    assert.ok(hint, `${lang}: mainnetTitle`);
    assert.match(hint, /Base/, `${lang}: names Base as the sale network`);
    assert.match(hint, /PEOPLE/, `${lang}: names PEOPLE mainnet as where PPL live`);
  }
});

const SELLBACK_OPEN_UNTIL_LIQUIDITY = {
  en: /until the reserve moves to liquidity/,
  es: /hasta que la reserva pase a liquidez/,
  pt: /até a reserva ir para a liquidez/,
  fr: /jusqu’au transfert de la réserve en liquidité/,
  de: /bis die Reserve in Liquidität überführt wird/,
  it: /finché la riserva non passa in liquidità/,
  tr: /rezerv likiditeye aktarılana kadar/,
  vi: /cho đến khi quỹ dự trữ được chuyển thành thanh khoản/,
  id: /sampai cadangan dipindahkan ke likuiditas/,
  zh: /直到储备转为流动性/,
  ar: /إلى أن يُنقل الاحتياطي إلى السيولة/,
};
const CLOSES_AFTER_GRADUATION =
  /Closes after graduation|Endet nach der Graduation|Se cierra tras la graduación|Fermée après la graduation|Se ferme après la graduation|Si chiude dopo la graduation|Encerra após a graduação|Graduation sonrasında kapanır|Ditutup setelah graduation|Đóng (lại )?sau (khi đường cong hoàn tất \(graduation\)|graduation)|毕业后关闭|يُغلق بعد التخرّج|تُغلق بعد التخرّج/;

test("/tokenomics sell-back: back to the sale wallet, nothing burned, open until liquidity", () => {
  const en = read("src", "lib", "tokenomics-content.ts");
  const enBlock = en.slice(en.indexOf("const en: TokenomicsCopy"), en.indexOf("const ru: TokenomicsCopy") > 0 ? en.indexOf("const ru: TokenomicsCopy") : undefined);
  assert.doesNotMatch(enBlock, /sold back is burned/i);
  assert.match(enBlock, /sale wallet on PEOPLE mainnet; nothing is burned/);
  assert.doesNotMatch(enBlock, CLOSES_AFTER_GRADUATION);
  assert.match(enBlock, SELLBACK_OPEN_UNTIL_LIQUIDITY.en);
  for (const lang of PUBLIC.filter((l) => l !== "en")) {
    const blob = JSON.stringify(surface("tokenomics", lang));
    assert.doesNotMatch(blob, CLOSES_AFTER_GRADUATION, `tokenomics-${lang}`);
    assert.match(blob, SELLBACK_OPEN_UNTIL_LIQUIDITY[lang], `tokenomics-${lang}`);
  }
});

test("terms: sell-back stays open until the reserve moves to liquidity", () => {
  for (const lang of PUBLIC) {
    const blob = JSON.stringify(surface("legal", lang).terms);
    assert.doesNotMatch(blob, CLOSES_AFTER_GRADUATION, `legal-${lang}`);
    assert.match(blob, SELLBACK_OPEN_UNTIL_LIQUIDITY[lang], `legal-${lang}`);
  }
});

test("litepaper, /transparency and roadmap: fixed dates, 1,000 verified gates transfers only", () => {
  const lp = read("src", "content", "litepaper", "en.md");
  assert.doesNotMatch(lp, /No dates are promised/);
  assert.doesNotMatch(lp, /At least 1,000 verified people \*\*and\*\* a live treasury multisig/);
  assert.match(lp, /30 November 2026, 12:00 UTC/);
  assert.match(lp, /1 December 2026, 00:00 UTC/);
  const lpUi = surface("litepaper", "en").charts;
  assert.doesNotMatch(lpUi.roadmapLead, /No dates are promised/);
  assert.doesNotMatch(JSON.stringify(lpUi.roadmapStages), /Mainnet of the PEOPLE network is a separate step/);
  const transparency = read("src", "lib", "transparency-content.ts");
  const tEn = transparency.slice(transparency.indexOf("const en: TransparencyCopy"), transparency.indexOf("const ru: TransparencyCopy"));
  assert.doesNotMatch(tEn, /Mainnet work starts once 1,000 people/);
  assert.match(tEn, /30 November 2026, 12:00 UTC/);
  assert.match(tEn, /1 December 2026, 00:00 UTC/);
  for (const lang of PUBLIC) {
    assert.doesNotMatch(JSON.stringify(surface("roadmap", lang)), /airdrop before sale at 1,000/, `roadmap-${lang}`);
  }
  assert.doesNotMatch(read("src", "lib", "roadmap-catalog.data.json"), /airdrop before sale at 1,000/);
});
