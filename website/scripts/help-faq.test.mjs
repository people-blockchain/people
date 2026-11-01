import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HELP_ENTRIES,
  HELP_TOPICS,
  HELP_VERIFIED_AT,
  answerFor,
  helpLang,
  pendingHelpEntries,
  resolveHelpFaq,
  searchHelpFaq,
} from "../src/lib/help/faq.ts";
import { docsContent } from "../src/lib/docs-content.ts";
import { V2_SALE } from "../src/lib/sale/v2/constants.ts";
import { SITE_ROUTES } from "../src/lib/site.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LANGS = ["en", "ru"];
const published = HELP_ENTRIES.filter((e) => e.status === "published");

test("entry ids are unique and every entry belongs to a known topic", () => {
  assert.equal(new Set(HELP_ENTRIES.map((e) => e.id)).size, HELP_ENTRIES.length);
  for (const e of HELP_ENTRIES) assert.ok(HELP_TOPICS.includes(e.topic), e.id);
});

test("every published entry has an RU and EN question and a non-empty answer", () => {
  for (const e of published) {
    assert.ok(e.q.en && e.q.ru && e.q.en !== e.q.ru, e.id);
    for (const lang of LANGS) assert.ok(answerFor(e.source, lang)?.trim(), `${e.id} ${lang}`);
  }
});

test("docs sources are pinned to the item title, so a reorder in /docs fails here", () => {
  for (const e of HELP_ENTRIES.filter((x) => x.source.kind === "docs")) {
    const { section, item, title } = e.source;
    const en = docsContent.en.sections.find((s) => s.id === section);
    const ru = docsContent.ru.sections.find((s) => s.id === section);
    assert.ok(en && ru, `${e.id}: missing section ${section}`);
    assert.equal(en.items[item]?.title, title, e.id);
    assert.equal(ru.items.length, en.items.length, `${e.id}: RU/EN item count differs in ${section}`);
  }
});

test("every link points at an existing page", () => {
  for (const e of HELP_ENTRIES) {
    for (const href of e.links) {
      assert.match(href, /^\/[a-z0-9/-]*$/, `${e.id} ${href}`);
      assert.ok(existsSync(join(root, "src/app", href, "page.tsx")), `${e.id}: no page for ${href}`);
    }
  }
});

test("the public page shows only published entries and never the sale", () => {
  for (const lang of [...LANGS, "de", "zh"]) {
    const topics = resolveHelpFaq(lang);
    const entries = topics.flatMap((t) => t.entries);
    assert.equal(entries.length, published.length, lang);
    assert.ok(entries.every((e) => e.status === "published"), lang);
    assert.ok(!topics.some((t) => t.id === "buy"), `${lang}: buy topic must stay hidden`);
    assert.ok(!entries.some((e) => e.links.includes("/buy")), `${lang}: /buy link leaked`);
    assert.ok(entries.every((e) => e.verifiedAt === HELP_VERIFIED_AT));
  }
  for (const e of published) assert.notEqual(e.source.kind, "buy", `${e.id} reads sale copy`);
});

test("pending entries name what needs confirming", () => {
  const pending = pendingHelpEntries();
  assert.ok(pending.length > 0);
  for (const e of pending) assert.ok(e.blocker && e.blocker.length > 10, e.id);
  const ids = pending.map((e) => e.id);
  for (const id of ["how-to-buy", "payment-networks", "sell-back", "refund", "transfers-open", "unbonding", "season-0", "ppl-supply"]) {
    assert.ok(ids.includes(id), `${id} must stay pending`);
  }
});

test("sale answers fill every placeholder from the live sale config", () => {
  const withPending = resolveHelpFaq("en", { includePending: true }).flatMap((t) => t.entries);
  const sellBack = withPending.find((e) => e.id === "sell-back");
  assert.ok(sellBack, "sell-back resolves once confirmed");
  assert.match(sellBack.a, new RegExp(`\\b${V2_SALE.holdDays}\\b`));
  for (const lang of LANGS) {
    for (const e of resolveHelpFaq(lang, { includePending: true }).flatMap((t) => t.entries)) {
      assert.doesNotMatch(e.a, /\{\w+\}/, `${lang} ${e.id}: unfilled placeholder`);
    }
  }
});

test("other languages read the EN copy", () => {
  assert.equal(helpLang("ru"), "ru");
  assert.equal(helpLang("de"), "en");
  assert.deepEqual(resolveHelpFaq("zh"), resolveHelpFaq("en"));
});

test("search matches questions and answers and recovers from empty queries", () => {
  const ru = resolveHelpFaq("ru");
  assert.deepEqual(searchHelpFaq(ru, "   "), ru);
  assert.ok(searchHelpFaq(ru, "  КОШЕЛЁК ").some((t) => t.entries.some((e) => e.id === "create-wallet")));
  assert.ok(searchHelpFaq(resolveHelpFaq("en"), "fees validators").some((t) => t.entries.some((e) => e.id === "fee-split")));
  assert.deepEqual(searchHelpFaq(ru, "nonexistent-query"), []);
});

test("/help is listed and the wallet links to it without loading the FAQ", () => {
  assert.ok(SITE_ROUTES.some((r) => r.path === "/help"));
  const wallet = readFileSync(join(root, "src/components/wallet/WalletApp.tsx"), "utf8");
  assert.match(wallet, /href="\/help"/);
  assert.match(wallet, /from "@\/lib\/help\/ui"/);
  assert.doesNotMatch(wallet, /@\/lib\/help\/faq/);
  assert.doesNotMatch(readFileSync(join(root, "src/lib/help/ui.ts"), "utf8"), /from "\.\/faq"|docs-content|buy-content/);
});
