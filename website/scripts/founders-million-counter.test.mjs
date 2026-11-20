#!/usr/bin/env node
import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveMillionCounterPayload } from "../src/lib/founders/million-counter.ts";

test("verified count under 1000 keeps current hidden / { goal: 1000, source: \"hidden\" }", () => {
  for (const count of [0, 1, 999]) {
    const payload = resolveMillionCounterPayload({ statsPublic: true, verifiedCount: count });
    assert.deepEqual(payload, { goal: 1000, source: "hidden" });
    assert.equal("current" in payload, false, `current leaked for count=${count}`);
  }
});

test("stats off hides current even when the count is at or above 1000", () => {
  assert.deepEqual(
    resolveMillionCounterPayload({ statsPublic: false, verifiedCount: 1500 }),
    { goal: 1000, source: "hidden" },
  );
});

test("stats on and count at or above 1000 returns the live verified count", () => {
  assert.deepEqual(
    resolveMillionCounterPayload({ statsPublic: true, verifiedCount: 1000 }),
    { current: 1000, goal: 1_000_000, source: "verified" },
  );
  assert.deepEqual(
    resolveMillionCounterPayload({ statsPublic: true, verifiedCount: 1_250_000 }),
    { current: 1_250_000, goal: 1_000_000, source: "verified" },
  );
});

test("missing or invalid verified count stays hidden", () => {
  for (const count of [null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const payload = resolveMillionCounterPayload({ statsPublic: true, verifiedCount: count });
    assert.deepEqual(payload, { goal: 1000, source: "hidden" });
    assert.equal("current" in payload, false);
  }
});
