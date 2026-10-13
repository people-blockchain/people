import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SITE_ROUTES } from "../src/lib/site.ts";
import { swapCopy } from "../src/lib/swap-content.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const langs = ["en", "ru", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];

test("swap route, page, and 12 locale surfaces exist", () => {
  assert.ok(SITE_ROUTES.some((route) => route.path === "/swap"));
  assert.ok(existsSync(join(root, "src/app/swap/page.tsx")));
  assert.ok(existsSync(join(root, "src/components/swap/SwapApp.tsx")));
  for (const lang of langs) {
    const path = join(root, "src/lib/locales/surfaces", `swap-${lang}.json`);
    assert.ok(existsSync(path), path);
    const copy = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(typeof copy.title, "string");
    assert.equal(typeof copy.swapSubmit, "string");
    assert.equal(typeof copy.tokensEmpty, "string");
    assert.equal(typeof copy.addSubmit, "string");
    assert.doesNotMatch(JSON.stringify(copy), /Phase 4/i);
    assert.ok(swapCopy[lang].title.length > 2, lang);
  }
});

test("nav moreLinks include /swap in every locale file", () => {
  const dir = join(root, "src/lib/locales");
  for (const lang of langs) {
    const text = readFileSync(join(dir, `${lang}.ts`), "utf8");
    assert.match(text, /"href": "\/swap"/, lang);
  }
});
