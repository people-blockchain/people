import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("the bounty page mounts the Founder NFT card and /founders still redirects to /bounty", () => {
  const page = read("src/app/bounty/page.tsx");
  const cardAt = page.indexOf("<FoundersNftCard");
  const countdownAt = page.indexOf("<BountyCountdown");
  const earnAt = page.indexOf("<BountyEarn");
  assert.ok(cardAt >= 0, "bounty page source must mount FoundersNftCard");
  assert.match(page, /<FoundersNftCard\s+signedIn=\{signedIn\}\s*\/>/);
  assert.ok(countdownAt >= 0 && cardAt > countdownAt, "the card sits after BountyCountdown");
  assert.ok(earnAt > cardAt, "the card sits before the earn section");

  const cfg = read("next.config.ts");
  const start = cfg.indexOf("async redirects()");
  const end = cfg.indexOf("async headers()");
  assert.ok(start >= 0 && end > start, "redirects() and headers() blocks are present");
  const redirects = cfg.slice(start, end);
  assert.match(redirects, /source:\s*"\/founders",\s*destination:\s*"\/bounty",\s*permanent:\s*false/);
  assert.match(
    redirects,
    /source:\s*"\/founders\/:path\*",\s*destination:\s*"\/bounty",\s*permanent:\s*false/,
  );
});
