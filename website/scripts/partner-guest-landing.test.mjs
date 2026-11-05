import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "src/lib/locales/surfaces");
const pagePath = join(root, "src/app/partner/page.tsx");

const guestKeys = [
  "guestLandingTitle",
  "guestLandingLead",
  "guestSignInCta",
  "guestWalletHint",
  "guestPreSaleNote",
  "preSaleBanner",
];

const langs = readdirSync(dir)
  .filter((name) => name.startsWith("partner-") && name.endsWith(".json"))
  .map((name) => name.replace(/^partner-/, "").replace(/\.json$/, ""));

test("guest landing copy keys exist in all partner locales", () => {
  for (const lang of langs) {
    const data = JSON.parse(readFileSync(join(dir, `partner-${lang}.json`), "utf8"));
    for (const key of guestKeys) {
      assert.equal(typeof data[key], "string", `${lang}.${key}`);
      assert.ok(data[key].trim().length > 0, `${lang}.${key} empty`);
    }
  }
});

test("partner page shows guest landing instead of login redirect when unauthenticated", () => {
  const src = readFileSync(pagePath, "utf8");
  assert.match(src, /PartnerGuestLanding/);
  const guestBranch = src.split("if (!session?.user?.id) {")[1]?.split("// A session cookie")[0] ?? "";
  assert.ok(guestBranch.length > 0, "guest branch not found");
  assert.match(guestBranch, /PartnerGuestLanding/);
  assert.doesNotMatch(
    guestBranch,
    /redirect\s*\(\s*["'`]\/login/,
    "guest branch must not redirect to login",
  );
});
