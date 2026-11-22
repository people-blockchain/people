import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { AI_SEARCH_USER_AGENTS, ROBOTS_DISALLOW } from "../src/lib/seo/crawlers.ts";
import { buildLlmsTxt } from "../src/lib/seo/llms.ts";
import {
  buyFaqPairs,
  faqPageJsonLd,
  jsonLdGraph,
  mainnetBetaEventJsonLd,
} from "../src/lib/seo/json-ld.ts";
import { SITE_ROUTES, SITE_URL } from "../src/lib/site.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("robots lists AI crawlers explicitly and blocks private paths", () => {
  const source = readFileSync(join(root, "src/app/robots.ts"), "utf8");
  assert.match(source, /AI_SEARCH_USER_AGENTS/);
  assert.equal(AI_SEARCH_USER_AGENTS.length, 7);
  assert.ok(ROBOTS_DISALLOW.includes("/api/"));
  assert.ok(ROBOTS_DISALLOW.includes("/admin"));
});

test("llms.txt names Mainnet Beta and links the sale", () => {
  const text = buildLlmsTxt();
  assert.match(text, /PEOPLE Mainnet Beta/);
  assert.match(text, new RegExp(`${SITE_URL.replace(/\./g, "\\.")}/buy`));
  assert.doesNotMatch(text, /testnet launch/i);
});

test("sitemap includes /buy once and no duplicate /help", () => {
  const paths = SITE_ROUTES.map((r) => r.path);
  assert.equal(paths.filter((p) => p === "/help").length, 1);
  assert.ok(paths.includes("/buy"));
  assert.ok(paths.includes("/bounty"));
});

test("JSON-LD FAQ and Event use site copy", () => {
  const faq = faqPageJsonLd(buyFaqPairs("en"));
  assert.ok(faq && faq.mainEntity.length >= 4);
  const graph = jsonLdGraph(mainnetBetaEventJsonLd(), faq);
  const event = graph["@graph"].find((n) => n["@type"] === "Event");
  assert.equal(event?.name, "PEOPLE Mainnet Beta");
  assert.match(event?.startDate ?? "", /^2026-12-01$/);
});