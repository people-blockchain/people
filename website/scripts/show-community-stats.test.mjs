#!/usr/bin/env node
import assert from "node:assert/strict";
import { test } from "node:test";

import { showCommunityStats } from "../src/lib/show-community-stats.ts";

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
