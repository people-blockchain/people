import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  MAX_CONTRACT_SOURCE_BYTES,
  sourceWithinLimit,
  utf8ByteLength
} from "../src/lib/contract-api-guards.ts";

test("sourceWithinLimit enforces max bytes", () => {
  const ok = "a".repeat(MAX_CONTRACT_SOURCE_BYTES);
  assert.equal(sourceWithinLimit(ok), true);
  assert.equal(sourceWithinLimit(ok + "x"), false);
  assert.equal(utf8ByteLength("é"), 2);
});

test("compose route requires a signed-in session", async () => {
  const src = await readFile(new URL("../src/app/api/contracts/compose/route.ts", import.meta.url), "utf8");
  assert.match(src, /sign_in_required/);
  assert.match(src, /await auth\(\)/);
});
