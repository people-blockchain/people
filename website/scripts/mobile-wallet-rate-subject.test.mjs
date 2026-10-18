import { test } from "node:test";
import assert from "node:assert/strict";
import { rateLimitSubject } from "../src/lib/mobile-wallet/rate-limit-subject.ts";

const prefix64 = "2001:0db8:85a3:0000";

test("IPv6 addresses in the same /64 share one rate-limit subject", () => {
  const a = rateLimitSubject("2001:0db8:85a3::8a2e:370:7334");
  const b = rateLimitSubject("2001:0db8:85a3:0:0:8a2e:370:7334");
  assert.equal(a, prefix64);
  assert.equal(b, prefix64);
  assert.equal(a, b);
});

test("different IPv6 /64 prefixes produce different subjects", () => {
  const first = rateLimitSubject("2001:0db8:85a3::1");
  const second = rateLimitSubject("2001:0db8:85a4::1");
  assert.equal(first, prefix64);
  assert.equal(second, "2001:0db8:85a4:0000");
  assert.notEqual(first, second);
});

test("compressed and expanded IPv6 notations normalize to the same subject", () => {
  assert.equal(
    rateLimitSubject("2001:DB8:85A3::7334"),
    rateLimitSubject("2001:0db8:85a3:0000:0000:0000:0000:7334"),
  );
});

test("IPv4 and unknown pass through unchanged", () => {
  assert.equal(rateLimitSubject("203.0.113.9"), "203.0.113.9");
  assert.equal(rateLimitSubject("unknown"), "unknown");
});
