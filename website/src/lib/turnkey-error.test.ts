import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeTurnkeyError, sanitizeTurnkeyLogText } from "./turnkey-error.ts";

describe("sanitizeTurnkeyError", () => {
  it("keeps a Turnkey permission code instead of collapsing to unknown", () => {
    const sanitized = sanitizeTurnkeyError({
      code: 7,
      message: "rpc error: code = PermissionDenied desc = organization access denied",
    });
    assert.equal(sanitized.code, "PermissionDenied");
    assert.match(sanitized.message, /organization access denied/i);
    assert.doesNotMatch(sanitized.message, /unknown/i);
  });

  it("reads uppercase machine codes from Error messages", () => {
    const sanitized = sanitizeTurnkeyError(new Error("PERMISSION_DENIED"));
    assert.equal(sanitized.code, "PERMISSION_DENIED");
    assert.equal(sanitized.message, "PERMISSION_DENIED");
  });

  it("redacts hex keys and import bundles from log text", () => {
    const hex = "ab".repeat(40);
    const bundle = "A".repeat(120);
    const sanitized = sanitizeTurnkeyError({
      code: "INVALID_REQUEST",
      message: `import failed key=${hex} bundle=${bundle}`,
    });
    assert.equal(sanitized.code, "INVALID_REQUEST");
    assert.match(sanitized.message, /\[redacted\]/);
    assert.equal(sanitized.message.includes(hex), false);
    assert.equal(sanitized.message.includes(bundle), false);
  });

  it("never returns unknown when a message exists", () => {
    const sanitized = sanitizeTurnkeyError(new Error("Turnkey activity failed"));
    assert.equal(sanitized.code, "turnkey_error");
    assert.equal(sanitized.message, "Turnkey activity failed");
    assert.notEqual(sanitized.code, "unknown");
  });
});

describe("sanitizeTurnkeyLogText", () => {
  it("strips PEM blocks", () => {
    const text = sanitizeTurnkeyLogText("begin -----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY----- end");
    assert.match(text, /\[redacted\]/);
    assert.doesNotMatch(text, /PRIVATE KEY/);
  });
});
