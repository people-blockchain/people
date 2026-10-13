import assert from "node:assert/strict";
import test from "node:test";
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
