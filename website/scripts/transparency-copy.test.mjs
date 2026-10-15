/**
 * Guards on the /transparency page copy and its entry points.
 *
 * The page is a public statement about money, so the wording is constrained by
 * decisions that must not drift: the treasury is a 2-of-3 multisig created
 * before mainnet (with no address published yet), the audit is promised — an
 * the three named AI models plus bug bounty, a third-party audit before mainnet,
 * never a completed external result — and no team member is named or pictured.
 * EN/RU key parity
 * itself is enforced by TypeScript (`TransparencyCopy`), so these tests only
 * check what the type system cannot see.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => readFileSync(join(root, ...parts), "utf8");

const LANGS = ["en", "ru", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];

/** Section bodies only — the header prose of this test mentions the banned words itself. */
function sectionBodies() {
  const source = read("src", "lib", "transparency-content.ts");
  return source.slice(source.indexOf("const en: TransparencyCopy"));
}

test("every locale links /transparency from its navigation and footer list", () => {
  for (const lang of LANGS) {
    const source = read("src", "lib", "locales", `${lang}.ts`);
    assert.match(source, /"\/transparency"/, `${lang} has no /transparency link`);
  }
  // The footer renders the same link list as the "More" menu, so one entry covers both.
  const footer = read("src", "components", "Footer.tsx");
  assert.match(footer, /moreLinks|footerLinks|nav\.more/i, "footer no longer reads the nav links");
});

test("every locale has a document title for /transparency", () => {
  const source = read("src", "lib", "site.ts");
  const titles = source.slice(source.indexOf("function titlesForLang"));
  assert.equal((titles.match(/transparency:\s*suffix\(/g) ?? []).length, LANGS.length);
  assert.match(titles, /transparency: suffix\("Команда и прозрачность"\)/);
  // …and the client-side title swap knows the route.
  assert.match(read("src", "components", "DocumentTitle.tsx"), /"\/transparency"/);
});

test("the treasury is a 2-of-3 multisig created before mainnet, with no address yet", () => {
  const copy = sectionBodies();
  assert.match(copy, /2-of-3/, "the approved 2-of-3 threshold must be stated");
  assert.match(copy, /2-из-3/, "the approved 2-of-3 threshold must be stated (RU)");
  assert.doesNotMatch(copy, /0x[0-9a-fA-F]{6,}/, "no address may appear on this page yet");
  assert.match(copy, /created before mainnet/);
  assert.match(copy, /создаваемый до mainnet/);
});

test("the audit names three AI models and never claims an external audit passed", () => {
  const copy = sectionBodies();
  assert.match(copy, /Audited by: Claude Opus 5\.5, GPT Astra, Fable 5\.1/);
  assert.match(copy, /Аудит: Claude Opus 5\.5, GPT Astra, Fable 5\.1/);
  assert.match(copy, /Bug bounty:/);
  assert.match(copy, /Баг-баунти:/);
  assert.doesNotMatch(copy, /Sonnet|Opus 5[^.]/);
  assert.doesNotMatch(copy, /\baudit (?:has )?passed\b/i, "no passed audit may be claimed");
  assert.doesNotMatch(copy, /аудит пройден/i);
  assert.match(copy, /third-party security audit report will be published/);
  assert.match(copy, /Отчёт аудита сторонней фирмы будет опубликован/);
});

test("no team member, partner or investor is named or pictured", () => {
  const copy = sectionBodies();
  assert.doesNotMatch(copy, /(?:CEO|CTO|COO|founder of|соучредитель|генеральный директор)/i);
  assert.match(copy, /no venture capital and no private investors/);
  assert.match(copy, /нет венчурного капитала и частных инвесторов/);
  // Decorative illustrations only: the page ships no portrait asset of its own.
  const page = read("src", "components", "transparency", "TransparencyPage.tsx");
  assert.doesNotMatch(page, /PersonAvatar|FounderCard|<img/, "no faces or photos on /transparency");
});

test("team vesting is stated as 0% at launch, a 6-month cliff then 18 months linear", () => {
  const copy = sectionBodies();
  assert.match(copy, /0% at launch/);
  assert.match(copy, /6-month cliff/);
  assert.match(copy, /24 months in total/);
  assert.match(copy, /0% при запуске/);
  assert.match(copy, /клифф 6 месяцев/);
  assert.match(copy, /всего 24 месяца/);
  assert.doesNotMatch(copy, /10% at mainnet genesis/);
  assert.doesNotMatch(copy, /10% при genesis mainnet/);
});

test("the genesis split labels come from the tokenomics copy, not from new numbers", () => {
  const page = read("src", "components", "transparency", "TransparencyPage.tsx");
  assert.match(page, /tokenomicsCopy\[lang\]\.bucketLabels/);
  assert.match(page, /GENESIS_ALLOCATIONS/);
  // A hard-coded percentage table would drift from /tokenomics.
  assert.doesNotMatch(page, /pct:\s*\d/, "bucket percentages must not be duplicated in the page");
});
