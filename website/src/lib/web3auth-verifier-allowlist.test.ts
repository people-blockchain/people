import { test } from "node:test";
import assert from "node:assert/strict";
import { isVerifierAllowed } from "./web3auth-verifier-allowlist";

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) prev[k] = process.env[k];
  try {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("isVerifierAllowed: no verifier/aggregateVerifier at all is refused", () => {
  withEnv({ WEB3AUTH_ALLOWED_VERIFIERS: undefined }, () => {
    assert.equal(isVerifierAllowed(null, null), false);
    assert.equal(isVerifierAllowed(undefined, undefined), false);
  });
});

test("isVerifierAllowed: default heuristic accepts google / email_passwordless by name", () => {
  withEnv({ WEB3AUTH_ALLOWED_VERIFIERS: undefined }, () => {
    assert.equal(isVerifierAllowed("google-oauth2", null), true);
    assert.equal(isVerifierAllowed("w3a-google", null), true);
    assert.equal(isVerifierAllowed("email-passwordless", null), true);
    assert.equal(isVerifierAllowed("email_passwordless", null), true);
    assert.equal(isVerifierAllowed(null, "w3a-google"), true);
  });
});

test("isVerifierAllowed: default heuristic rejects anything else (discord, facebook, github, twitter)", () => {
  withEnv({ WEB3AUTH_ALLOWED_VERIFIERS: undefined }, () => {
    assert.equal(isVerifierAllowed("discord", "w3a-discord"), false);
    assert.equal(isVerifierAllowed("facebook", null), false);
    assert.equal(isVerifierAllowed("github", null), false);
    assert.equal(isVerifierAllowed("twitter", null), false);
  });
});

test("isVerifierAllowed: explicit WEB3AUTH_ALLOWED_VERIFIERS overrides the heuristic to an exact match", () => {
  withEnv({ WEB3AUTH_ALLOWED_VERIFIERS: "my-exact-verifier-name" }, () => {
    assert.equal(isVerifierAllowed("my-exact-verifier-name", null), true);
    // Google would pass the default heuristic, but once the env allowlist is set it is exact-match only.
    assert.equal(isVerifierAllowed("google-oauth2", null), false);
  });
});

test("isVerifierAllowed: explicit allowlist is comma-separated and case-insensitive", () => {
  withEnv({ WEB3AUTH_ALLOWED_VERIFIERS: "Verifier-A, verifier-b" }, () => {
    assert.equal(isVerifierAllowed("verifier-a", null), true);
    assert.equal(isVerifierAllowed("VERIFIER-B", null), true);
    assert.equal(isVerifierAllowed("verifier-c", null), false);
  });
});

test("isVerifierAllowed: explicit allowlist also matches via aggregateVerifier", () => {
  withEnv({ WEB3AUTH_ALLOWED_VERIFIERS: "aggregate-x" }, () => {
    assert.equal(isVerifierAllowed("sub-verifier", "aggregate-x"), true);
  });
});
