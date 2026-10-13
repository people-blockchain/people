import assert from "node:assert/strict";
import test from "node:test";
import { parseIpfsUri, toIpfsUri, isValidIpfsCid } from "../src/lib/ipfs.ts";

const SAMPLE = "QmYwAPJzv5CZsnA625s3Xv2gteR83C12YCZqGbv3bdgqm4";

test("parse and format ipfs URIs", () => {
  assert.equal(isValidIpfsCid(SAMPLE), true);
  assert.equal(parseIpfsUri(`ipfs://${SAMPLE}/meta.json`), SAMPLE);
  assert.equal(toIpfsUri(SAMPLE), `ipfs://${SAMPLE}`);
  assert.equal(parseIpfsUri("https://example.com"), null);
  assert.throws(() => toIpfsUri("not-a-cid"));
});
