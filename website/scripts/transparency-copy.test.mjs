/**
 * Guards on the /transparency page copy and its entry points.
 *
 * The page is a public statement about money, so the wording is constrained by
 * decisions that must not drift: the treasury is described in the future tense
 * with no address and no multisig threshold, the audit is not called
 * independent, and no team member is named or pictured. EN/RU key parity itself
 * is enforced by TypeScript (`TransparencyCopy`), so these tests only check what
 * the type system cannot see.
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

test("the treasury is future tense, with no address and no threshold", () => {
  const copy = sectionBodies();
  assert.doesNotMatch(copy, /\d\s*(?:of|из)\s*\d/i, "a multisig threshold must not be published");
  assert.doesNotMatch(copy, /0x[0-9a-fA-F]{6,}/, "no address may appear on this page yet");
  assert.match(copy, /will move to a multisig/);
  assert.match(copy, /казна перейдёт в мультисиг/);
});

test("the audit is promised, not claimed, and never called independent", () => {
  const copy = sectionBodies();
  assert.match(copy, /goes through a security audit before mainnet/);
  assert.match(copy, /проходит аудит безопасности до mainnet/);
  assert.doesNotMatch(copy, /independent|third[- ]party|независим/i);
  // The report slot exists but states nothing until a report does.
  assert.match(copy, /will be published in this slot/);
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

test("team vesting is stated as 10% at genesis and 24 months linear", () => {
  const copy = sectionBodies();
  assert.match(copy, /10% at mainnet genesis/);
  assert.match(copy, /24 months/);
  assert.match(copy, /10% при genesis mainnet/);
  assert.match(copy, /24 месяца/);
});

test("the genesis split labels come from the tokenomics copy, not from new numbers", () => {
  const page = read("src", "components", "transparency", "TransparencyPage.tsx");
  assert.match(page, /tokenomicsCopy\[lang\]\.bucketLabels/);
  assert.match(page, /GENESIS_ALLOCATIONS/);
  // A hard-coded percentage table would drift from /tokenomics.
  assert.doesNotMatch(page, /pct:\s*\d/, "bucket percentages must not be duplicated in the page");
});
