import assert from "node:assert/strict";
import { test } from "node:test";

test("isSocialLoginEnabled defaults to false", async () => {
  const prev = process.env.NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED;
  delete process.env.NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED;
  const { isSocialLoginEnabled } = await import("./social-login.ts");
  assert.equal(isSocialLoginEnabled(), false);
  if (prev === undefined) delete process.env.NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED;
  else process.env.NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED = prev;
});

test("withSocialLoginCopy prefers *Social keys when enabled", async () => {
  const prev = process.env.NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED;
  process.env.NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED = "true";
  // Re-import is cached; call prefer via dynamic by reading the module's functions
  // that read env at call time (isSocialLoginEnabled reads env each call).
  const { withSocialLoginCopy, isSocialLoginEnabled } = await import("./social-login.ts");
  assert.equal(isSocialLoginEnabled(), true);
  const input = {
    modalExplainer: "email only",
    modalExplainerSocial: "Google or email",
    nested: { after: "email", afterSocial: "Google" },
  };
  const out = withSocialLoginCopy(input);
  assert.equal(out.modalExplainer, "Google or email");
  assert.equal(out.nested.after, "Google");
  assert.equal("modalExplainerSocial" in out, false);

  process.env.NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED = "false";
  const off = withSocialLoginCopy(input);
  assert.equal(off.modalExplainer, "email only");
  assert.equal(off.nested.after, "email");

  if (prev === undefined) delete process.env.NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED;
  else process.env.NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED = prev;
});
