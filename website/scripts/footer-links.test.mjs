import { test } from "node:test";
import assert from "node:assert/strict";
import { en } from "../src/lib/locales/en.ts";
import { ru } from "../src/lib/locales/ru.ts";
import { es } from "../src/lib/locales/es.ts";
import { pt } from "../src/lib/locales/pt.ts";
import { fr } from "../src/lib/locales/fr.ts";
import { it } from "../src/lib/locales/it.ts";
import { ar } from "../src/lib/locales/ar.ts";
import { id } from "../src/lib/locales/id.ts";
import { vi } from "../src/lib/locales/vi.ts";
import { tr } from "../src/lib/locales/tr.ts";
import { zh } from "../src/lib/locales/zh.ts";
import { de } from "../src/lib/locales/de.ts";

// Import each locale module directly (explicit .ts extension) rather than `content.ts`:
// `content.ts` uses extensionless relative imports that the Next bundler resolves but raw
// Node ESM does not, so a test importing it dies with ERR_MODULE_NOT_FOUND.
const content = { en, ru, es, pt, fr, it, ar, id, vi, tr, zh, de };
const langs = ["en", "ru", "es", "pt", "fr", "it", "ar", "id", "vi", "tr", "zh", "de"];

/**
 * The footer renders three link groups: `nav.links` + `nav.moreLinks` under
 * "Architecture" and `nav.protocolLinks` under "Protocol". Every href/label in
 * that combined set must be unique — the owner reported the same destination
 * being listed twice (Network / How it works / Economics all resolving to
 * /how-it-works, and PPL tokenomics under both Architecture and Protocol).
 *
 * Comparison is on the full href string, so a bare page and a deep link into a
 * section of that same page (`/docs` vs `/docs#product-phases`) remain distinct
 * targets. Two entries pointing at the exact same URL are always a duplicate.
 */
function duplicateValues(values) {
  const seen = new Map();
  const dupes = new Set();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.set(value, true);
  }
  return [...dupes];
}

test("footer link groups contain no duplicate hrefs or labels in any locale", () => {
  for (const lang of langs) {
    const nav = content[lang].nav;
    const links = [...nav.links, ...nav.moreLinks, ...nav.protocolLinks];
    assert.ok(links.length > 0, `${lang}: footer has no links`);

    const dupHrefs = duplicateValues(links.map((link) => link.href));
    assert.deepEqual(dupHrefs, [], `${lang}: duplicate footer href(s): ${dupHrefs.join(", ")}`);

    const dupLabels = duplicateValues(links.map((link) => link.label));
    assert.deepEqual(dupLabels, [], `${lang}: duplicate footer label(s): ${dupLabels.join(", ")}`);
  }
});

test("footer lists 'How It Works' once and keeps tokenomics only under Protocol", () => {
  for (const lang of langs) {
    const nav = content[lang].nav;
    const moreLinks = nav.moreLinks;
    const protocolLinks = nav.protocolLinks;

    // Regression: 'Network' (/how-it-works#live-now) and 'Economics'
    // (/how-it-works#rewards) duplicated the 'How It Works' entry.
    const howItWorksPage = [...nav.links, ...moreLinks, ...protocolLinks].filter(
      (link) => link.href.split("#")[0] === "/how-it-works",
    );
    assert.equal(howItWorksPage.length, 1, `${lang}: expected a single link to /how-it-works`);
    assert.equal(howItWorksPage[0].href, "/how-it-works", `${lang}: /how-it-works link must be the bare page`);

    // Regression: 'PPL tokenomics' appeared under both Architecture and Protocol.
    assert.equal(
      moreLinks.filter((link) => link.href === "/tokenomics").length,
      0,
      `${lang}: /tokenomics must not appear in moreLinks`,
    );
    assert.equal(
      protocolLinks.filter((link) => link.href === "/tokenomics").length,
      1,
      `${lang}: /tokenomics must appear exactly once under Protocol`,
    );

    // The 'Network' and 'Economics' entries are gone for good (locale-independent:
    // match on the hrefs they used, not on the translated labels).
    const hrefs = [...nav.links, ...moreLinks, ...protocolLinks].map((link) => link.href);
    assert.ok(!hrefs.includes("/how-it-works#live-now"), `${lang}: 'Network' entry is back`);
    assert.ok(!hrefs.includes("/how-it-works#rewards"), `${lang}: 'Economics' entry is back`);
  }
});
