/**
 * Chart wiring must use locale-stable slots — heading slugs are translated.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadLitepaperMarkdown } from "../src/lib/litepaper/content.ts";
import { groupLitepaperSections } from "../src/lib/litepaper/sections.ts";

const LANGS = ["en", "ru", "es", "de", "zh", "ar", "fr", "pt", "it", "tr", "vi", "id"];

const EXPECTED = {
  5: "technology",
  6: "tokenomics",
  7: "founders",
  8: "roadmap",
  12: "differ",
};

test("every locale maps the same ## order to the same chartSlot", async () => {
  for (const lang of LANGS) {
    const { blocks } = await loadLitepaperMarkdown(lang);
    const sections = groupLitepaperSections(blocks);
    assert.equal(sections.length, 13, `${lang} section count`);
    for (const [index, slot] of Object.entries(EXPECTED)) {
      const sec = sections[Number(index) - 1];
      assert.ok(sec, `${lang} missing section ${index}`);
      assert.equal(sec.chartSlot, slot, `${lang} #${index} (${sec.id}) chartSlot`);
    }
    // English ids must still work; RU must NOT equal English tokenomics slug.
    if (lang === "ru") {
      assert.notEqual(sections[5].id, "5-tokenomics");
      assert.match(sections[5].id, /токен/i);
    }
  }
});
