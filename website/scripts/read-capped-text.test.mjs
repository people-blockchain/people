// AUDIT M5: proxies read upstream bodies through a byte cap instead of `res.text()`.
import assert from "node:assert/strict";
import test from "node:test";
import { readCappedText } from "../src/lib/read-capped-text.ts";

test("returns the body when it fits the cap", async () => {
  assert.equal(await readCappedText(new Response("hello"), 5), "hello");
});

test("returns null once the streamed body exceeds the cap", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("abc"));
      controller.enqueue(new TextEncoder().encode("def"));
      controller.close();
    },
  });
  assert.equal(await readCappedText(new Response(stream), 5), null);
});

test("returns null up front when content-length already exceeds the cap", async () => {
  const res = new Response("x".repeat(10), { headers: { "content-length": "10" } });
  assert.equal(await readCappedText(res, 5), null);
});
