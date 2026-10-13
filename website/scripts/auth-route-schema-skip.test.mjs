import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { authGetNeedsSchema } from "../src/lib/auth-schema-skip.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const routeSource = readFileSync(join(root, "src/app/api/auth/[...nextauth]/route.ts"), "utf8");

test("JWT session, csrf and providers reads skip the schema bootstrap", () => {
  assert.equal(authGetNeedsSchema("/api/auth/session"), false);
  assert.equal(authGetNeedsSchema("/api/auth/csrf"), false);
  assert.equal(authGetNeedsSchema("/api/auth/providers"), false);
});

test("every other auth GET still bootstraps the schema", () => {
  const mustBootstrap = [
    "/api/auth/signin",
    "/api/auth/signin/google",
    "/api/auth/callback/google",
    "/api/auth/verify-request",
    "/api/auth/error",
    // Only the exact reads are exempt: a trailing slash or an unknown action keeps the old path.
    "/api/auth/session/",
    "/api/auth/csrf/",
    "/api/auth/providers/",
    "/api/auth/sessions",
  ];
  for (const pathname of mustBootstrap) {
    assert.equal(authGetNeedsSchema(pathname), true, pathname);
  }
});

test("the route handler consults the predicate for GET using the request pathname", () => {
  assert.match(routeSource, /if \(authGetNeedsSchema\(new URL\(request\.url\)\.pathname\)\) await ensurePartnerSchema\(\);/);
});

test("POST still awaits the schema bootstrap unconditionally", () => {
  const postAt = routeSource.indexOf("export async function POST");
  assert.notEqual(postAt, -1, "POST handler missing");
  const postSource = routeSource.slice(postAt);
  assert.match(postSource, /await ensurePartnerSchema\(\);/);
  assert.doesNotMatch(postSource, /authGetNeedsSchema/);
});
