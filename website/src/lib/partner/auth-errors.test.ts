import assert from "node:assert/strict";
import { test } from "node:test";
import { authErrorMessage } from "./auth-errors.ts";

const t = {
  authErrorDefault: "default",
  authErrorConfiguration: "configuration",
  authErrorAccessDenied: "denied",
  authErrorVerification: "verification",
  authErrorOAuth: "oauth",
  authErrorCreateAccount: "create",
  authErrorAccountNotLinked: "linked",
  authErrorEmailSignin: "email",
} as const;

test("authErrorMessage is null without a code", () => {
  assert.equal(authErrorMessage(undefined, t), null);
  assert.equal(authErrorMessage("", t), null);
});

test("authErrorMessage maps Auth.js codes to human copy", () => {
  assert.equal(authErrorMessage("Configuration", t), "configuration");
  assert.equal(authErrorMessage("Verification", t), "verification");
  assert.equal(authErrorMessage("OAuthCallback", t), "oauth");
  assert.equal(authErrorMessage("Callback", t), "oauth");
  assert.equal(authErrorMessage("EmailCreateAccount", t), "create");
  assert.equal(authErrorMessage("OAuthAccountNotLinked", t), "linked");
  assert.equal(authErrorMessage("EmailSignin", t), "email");
  assert.equal(authErrorMessage("AccessDenied", t), "denied");
  assert.equal(authErrorMessage("Nope", t), "default");
});
