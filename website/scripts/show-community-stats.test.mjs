#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { showCommunityStats } from "../src/lib/show-community-stats.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("showCommunityStats is false by default", () => {
  const prev = process.env.NEXT_PUBLIC_SHOW_COMMUNITY_STATS;
  delete process.env.NEXT_PUBLIC_SHOW_COMMUNITY_STATS;
  assert.equal(showCommunityStats(), false);
  if (prev === undefined) delete process.env.NEXT_PUBLIC_SHOW_COMMUNITY_STATS;
  else process.env.NEXT_PUBLIC_SHOW_COMMUNITY_STATS = prev;
});

test("showCommunityStats accepts true and 1", () => {
  const prev = process.env.NEXT_PUBLIC_SHOW_COMMUNITY_STATS;
  process.env.NEXT_PUBLIC_SHOW_COMMUNITY_STATS = "true";
  assert.equal(showCommunityStats(), true);
  process.env.NEXT_PUBLIC_SHOW_COMMUNITY_STATS = "1";
  assert.equal(showCommunityStats(), true);
  if (prev === undefined) delete process.env.NEXT_PUBLIC_SHOW_COMMUNITY_STATS;
  else process.env.NEXT_PUBLIC_SHOW_COMMUNITY_STATS = prev;
});

test("BountyCommunity and FoundersMillionCounterBar keep goal copy when flag is off", () => {
  const bounty = readFileSync(
    join(root, "src/components/bounty/BountyHub.tsx"),
    "utf8",
  );
  const founders = readFileSync(
    join(root, "src/components/founders/FoundersLandingSections.tsx"),
    "utf8",
  );
  assert.doesNotMatch(bounty, /if \(!statsPublic\) return null;/);
  assert.match(bounty, /if \(!statsPublic\)/);
  assert.match(founders, /if \(!statsPublic\)/);
  assert.doesNotMatch(founders, /if \(!showCommunityStats\(\)\) return null;/);
});
