import assert from "node:assert/strict";
import { test } from "node:test";
import { isDiscoverAdminIdentity } from "../src/lib/discover/admin-config.ts";

test("referral partners admin API access: nobody is admin without env lists", () => {
  const prevIds = process.env.DISCOVER_ADMIN_USER_IDS;
  const prevEmails = process.env.DISCOVER_ADMIN_EMAILS;
  delete process.env.DISCOVER_ADMIN_USER_IDS;
  delete process.env.DISCOVER_ADMIN_EMAILS;
  try {
    assert.equal(isDiscoverAdminIdentity({ userId: "any", email: "a@b.com", provider: "google" }), false);
  } finally {
    if (prevIds === undefined) delete process.env.DISCOVER_ADMIN_USER_IDS;
    else process.env.DISCOVER_ADMIN_USER_IDS = prevIds;
    if (prevEmails === undefined) delete process.env.DISCOVER_ADMIN_EMAILS;
    else process.env.DISCOVER_ADMIN_EMAILS = prevEmails;
  }
});
