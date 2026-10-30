import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TOKEN_ICON_MAX_BYTES,
  isTokenIconUri,
  tokenIconMessage,
  validateTokenIcon,
} from "../src/lib/token-icon-rules.ts";

test("accepts PNG/JPEG/WEBP at the size and dimension limits", () => {
  assert.deepEqual(validateTokenIcon({ type: "image/png", size: 1, width: 64, height: 64 }), { ok: true });
  assert.deepEqual(validateTokenIcon({ type: "image/jpeg", size: TOKEN_ICON_MAX_BYTES, width: 512, height: 64 }), { ok: true });
  assert.deepEqual(validateTokenIcon({ type: "image/webp", size: 2048, width: 100, height: 100 }), { ok: true });
});

test("rejects other file types", () => {
  assert.deepEqual(validateTokenIcon({ type: "image/gif", size: 100, width: 64, height: 64 }), {
    ok: false,
    error: "type",
  });
  assert.deepEqual(validateTokenIcon({ type: "", size: 100, width: 64, height: 64 }), {
    ok: false,
    error: "type",
  });
});

test("rejects empty and oversized files", () => {
  assert.deepEqual(validateTokenIcon({ type: "image/png", size: 0, width: 64, height: 64 }), {
    ok: false,
    error: "size",
  });
  assert.deepEqual(validateTokenIcon({ type: "image/png", size: TOKEN_ICON_MAX_BYTES + 1, width: 64, height: 64 }), {
    ok: false,
    error: "size",
  });
});

test("rejects images smaller than 64x64 when dimensions are known", () => {
  assert.deepEqual(validateTokenIcon({ type: "image/png", size: 100, width: 63, height: 64 }), {
    ok: false,
    error: "dimensions",
  });
  assert.deepEqual(validateTokenIcon({ type: "image/png", size: 100, width: 64, height: 1 }), {
    ok: false,
    error: "dimensions",
  });
});

test("type and size can be checked before the browser reads dimensions", () => {
  assert.deepEqual(validateTokenIcon({ type: "image/png", size: 100 }), { ok: true });
});

test("tokenIconMessage is the exact creator-signed text", () => {
  assert.equal(
    tokenIconMessage(
      "0x1111111111111111111111111111111111111111",
      "ipfs://bafy-icon",
      "2026-10-29T12:00:00.000Z",
    ),
    "PEOPLE token icon update\nToken: 0x1111111111111111111111111111111111111111\nImage: ipfs://bafy-icon\nIssued: 2026-10-29T12:00:00.000Z",
  );
});

test("only permanent ipfs:// and https:// image URIs are accepted", () => {
  assert.equal(isTokenIconUri("ipfs://bafy-icon"), true);
  assert.equal(isTokenIconUri("https://example.com/icon.png"), true);
  assert.equal(isTokenIconUri("http://example.com/icon.png"), false);
  assert.equal(isTokenIconUri("javascript:alert(1)"), false);
  assert.equal(isTokenIconUri(""), false);
});
