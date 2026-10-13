import assert from "node:assert/strict";
import { test } from "node:test";
import { maskEmail } from "./mask.ts";

// M03-1: the cabinet must not hand the partner a full invitee/inviter email.
test("maskEmail keeps the first character and the domain", () => {
  assert.equal(maskEmail("alice@gmail.com"), "a***@gmail.com");
  assert.equal(maskEmail("bob@example.co.uk"), "b***@example.co.uk");
});

test("maskEmail never leaks more than the first character of the local part", () => {
  const masked = maskEmail("verysecretname@proton.me");
  assert.equal(masked, "v***@proton.me");
  assert.ok(!masked.includes("secret"));
});

test("maskEmail returns null for missing or malformed addresses", () => {
  assert.equal(maskEmail(null), null);
  assert.equal(maskEmail(undefined), null);
  assert.equal(maskEmail(""), null);
  assert.equal(maskEmail("no-at-sign"), null);
  assert.equal(maskEmail("@leading-at.com"), null);
});
