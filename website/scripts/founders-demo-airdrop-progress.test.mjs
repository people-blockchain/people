// AUDIT M3: the demo airdrop records each transfer before broadcasting it, so a retry after a
// partial failure resumes instead of paying out again. These cover the stored state format.
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  emptyAirdropProgress,
  isAirdropDelivered,
  isLeaseHeld,
  parseAirdropProgress,
  serializeAirdropProgress,
} = await import("../src/lib/founders/demo-airdrop-progress.ts");

const rec = { hash: `0x${"aa".repeat(32)}`, raw: "0xf86b01" };

test("a fresh reservation (null summary) is in progress with nothing sent", () => {
  assert.deepEqual(parseAirdropProgress(null), emptyAirdropProgress());
  assert.equal(isAirdropDelivered(null), false);
});

test("the completed array format (including legacy rows) counts as delivered", () => {
  const summary = JSON.stringify([rec.hash]);
  assert.equal(parseAirdropProgress(summary), null);
  assert.equal(isAirdropDelivered(summary), true);
});

test("in-progress state round-trips and is not reported as delivered", () => {
  const progress = { v: 2, leaseUntil: 123, sent: { trosc2: rec } };
  const summary = serializeAirdropProgress(progress);
  assert.deepEqual(parseAirdropProgress(summary), progress);
  assert.equal(isAirdropDelivered(summary), false);
});

test("malformed transfer records are dropped rather than trusted", () => {
  const summary = JSON.stringify({ v: 2, leaseUntil: 0, sent: { a: { hash: "nope" }, b: rec } });
  assert.deepEqual(parseAirdropProgress(summary)?.sent, { b: rec });
});

test("a lease only blocks until it expires", () => {
  const now = 1_000_000;
  assert.equal(isLeaseHeld({ v: 2, leaseUntil: now + 1, sent: {} }, now), true);
  assert.equal(isLeaseHeld({ v: 2, leaseUntil: now - 1, sent: {} }, now), false);
});
