import { test } from "node:test";
import assert from "node:assert/strict";
import { isIP } from "node:net";
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

test("IPv4-mapped IPv6 yields the embedded IPv4 as subject", () => {
  assert.equal(isIP("::ffff:1.2.3.4"), 6);
  assert.equal(rateLimitSubject("::ffff:1.2.3.4"), "1.2.3.4");
  assert.equal(rateLimitSubject("::ffff:1.2.3.4"), rateLimitSubject("1.2.3.4"));
  assert.notEqual(rateLimitSubject("::ffff:1.2.3.4"), rateLimitSubject("::ffff:5.6.7.8"));
  assert.equal(rateLimitSubject("::ffff:5.6.7.8"), "5.6.7.8");
});

test("embedded trailing IPv4 uses two hex groups so different /64 prefixes do not merge", () => {
  const a = "2001:db8:1::abcd:1.2.3.4";
  const b = "2001:db8:2::abcd:1.2.3.4";
  assert.equal(isIP(a), 6);
  assert.equal(isIP(b), 6);
  assert.equal(rateLimitSubject(a), "2001:0db8:0001:0000");
  assert.equal(rateLimitSubject(b), "2001:0db8:0002:0000");
  assert.notEqual(rateLimitSubject(a), rateLimitSubject(b));

  assert.equal(rateLimitSubject("1::2:3:4:5:1.2.3.4"), "0001:0000:0002:0003");

  const c = "1:2::4:5:6:1.2.3.4";
  const d = "1:2:0:5:0:4:1.2.3.4";
  assert.equal(isIP(c), 6);
  assert.equal(isIP(d), 6);
  assert.notEqual(rateLimitSubject(c), rateLimitSubject(d));
});

test("zone id is stripped before subject normalization", () => {
  assert.equal(rateLimitSubject("::ffff:1.2.3.4%eth0"), "1.2.3.4");
  assert.equal(rateLimitSubject("::ffff:1.2.3.4%eth0"), rateLimitSubject("::ffff:1.2.3.4"));
  assert.equal(rateLimitSubject("fe80::1%eth0"), rateLimitSubject("fe80::1"));
  assert.equal(rateLimitSubject("2001:db8::1%eth0"), "2001:0db8:0000:0000");
  assert.equal(rateLimitSubject("2001:db8::1%eth0"), rateLimitSubject("2001:db8::1"));
});
