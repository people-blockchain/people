import { test } from "node:test";
import assert from "node:assert/strict";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  describeWeb3AuthIdTokenForLog,
  verifyWeb3AuthIdToken,
  WEB3AUTH_ID_TOKEN_MAX_AGE_SEC,
} from "@/lib/web3auth-id-token";
import {
  WEB3AUTH_CITADEL_ID_TOKEN_ISSUER,
  WEB3AUTH_ID_TOKEN_ISSUER,
} from "@/lib/web3auth-config";

const CLIENT_ID = "test-client-id";
const web3auth = await generateKeyPair("ES256");
const citadel = await generateKeyPair("ES256");
const attacker = await generateKeyPair("ES256");
const jwk = { ...(await exportJWK(web3auth.publicKey)), kid: "w3a-1", alg: "ES256" };
const citadelJwk = { ...(await exportJWK(citadel.publicKey)), kid: "citadel-1", alg: "ES256" };
const keySet = createLocalJWKSet({ keys: [jwk] });
const citadelKeySet = createLocalJWKSet({ keys: [citadelJwk] });
const opts = { keySet, clientId: CLIENT_ID };
const citadelOpts = {
  keySets: { [WEB3AUTH_CITADEL_ID_TOKEN_ISSUER]: citadelKeySet },
  clientId: CLIENT_ID,
};

const b64 = (o) => Buffer.from(JSON.stringify(o), "utf8").toString("base64url");
const nowSec = () => Math.floor(Date.now() / 1000);

async function sign(claims, { key = web3auth.privateKey, kid = "w3a-1" } = {}) {
  const iat = nowSec();
  return new SignJWT({ email: "ada@example.com", name: "Ada", verifierId: "ada@example.com", verifier: "web3auth", aggregateVerifier: "w3a-google", email_verified: true, ...claims })
    .setProtectedHeader({ alg: "ES256", kid })
    .setIssuer(claims.iss ?? WEB3AUTH_ID_TOKEN_ISSUER)
    .setAudience(claims.aud ?? CLIENT_ID)
    .setIssuedAt(claims.iat ?? iat)
    .setExpirationTime(claims.exp ?? iat + 3600)
    .sign(key);
}

test("valid Web3Auth idToken → profile with email and verifier fields", async () => {
  const profile = await verifyWeb3AuthIdToken(await sign({ sub: "google|123" }), opts);
  assert.equal(profile.email, "ada@example.com");
  assert.equal(profile.sub, "google|123");
  assert.equal(profile.verifierId, "ada@example.com");
  assert.equal(profile.verifier, "web3auth");
  assert.equal(profile.aggregateVerifier, "w3a-google");
  assert.equal(profile.emailVerified, true);
});

test("alg:none / garbage signature is rejected (M02-1 PoC)", async () => {
  const forged = `${b64({ alg: "none", typ: "JWT" })}.${b64({
    aud: CLIENT_ID,
    iss: WEB3AUTH_ID_TOKEN_ISSUER,
    exp: nowSec() + 3600,
    iat: nowSec(),
    email: "victim@example.com",
  })}.not-a-signature`;
  await assert.rejects(verifyWeb3AuthIdToken(forged, opts));
  await assert.rejects(verifyWeb3AuthIdToken(`x.${b64({ email: "victim@example.com" })}.x`, opts));
});

test("token signed by a foreign key is rejected", async () => {
  await assert.rejects(verifyWeb3AuthIdToken(await sign({}, { key: attacker.privateKey }), opts));
});

test("expired token is rejected", async () => {
  const iat = nowSec() - 7200;
  await assert.rejects(verifyWeb3AuthIdToken(await sign({ iat, exp: iat + 3600 }), opts));
});

test("token older than the replay window is rejected", async () => {
  const iat = nowSec() - WEB3AUTH_ID_TOKEN_MAX_AGE_SEC - 120;
  await assert.rejects(verifyWeb3AuthIdToken(await sign({ iat, exp: iat + 86400 }), opts));
});

test("missing or foreign aud is rejected", async () => {
  await assert.rejects(verifyWeb3AuthIdToken(await sign({ aud: "other-project" }), opts));
  const iat = nowSec();
  const noAud = await new SignJWT({ email: "ada@example.com" })
    .setProtectedHeader({ alg: "ES256", kid: "w3a-1" })
    .setIssuer(WEB3AUTH_ID_TOKEN_ISSUER)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 3600)
    .sign(web3auth.privateKey);
  await assert.rejects(verifyWeb3AuthIdToken(noAud, opts));
});

test("foreign issuer is rejected", async () => {
  await assert.rejects(verifyWeb3AuthIdToken(await sign({ iss: "https://authjs.web3auth.io" }), opts));
});

test("email only from payload.email; an explicit unverified claim is rejected", async () => {
  await assert.rejects(verifyWeb3AuthIdToken(await sign({ email: undefined, name: "victim@example.com" }), opts));
  await assert.rejects(verifyWeb3AuthIdToken(await sign({ email_verified: false }), opts));
  const ok = await verifyWeb3AuthIdToken(await sign({ email_verified: true }), opts);
  assert.equal(ok.email, "ada@example.com");
  assert.equal(ok.emailVerified, true);
});

test("Web3Auth v9 regression: Google aggregate verifier omitting email_verified is accepted", async () => {
  // Web3Auth modal idTokens never carry `email_verified` (documented claims: iat, aud, iss,
  // email, name, profileImage, verifier, verifierId, aggregateVerifier, exp, wallets). The
  // pre-fix `!== true` check rejected every login, including already-bound existing users.
  const profile = await verifyWeb3AuthIdToken(await sign({ email_verified: undefined }), opts);
  assert.equal(profile.email, "ada@example.com");
  assert.equal(profile.aggregateVerifier, "w3a-google");
  assert.equal(profile.emailVerified, true, "a Google verifier proves ownership of the address");
});

test("a google verifier alone (no aggregateVerifier) without the claim is accepted", async () => {
  const profile = await verifyWeb3AuthIdToken(
    await sign({ email_verified: undefined, verifier: "google-oauth2", aggregateVerifier: null }),
    opts,
  );
  assert.equal(profile.emailVerified, true);
});

test("email_passwordless verifier without email_verified is accepted", async () => {
  const profile = await verifyWeb3AuthIdToken(
    await sign({
      email_verified: undefined,
      verifier: "email_passwordless",
      aggregateVerifier: "w3a-email-passwordless",
    }),
    opts,
  );
  assert.equal(profile.email, "ada@example.com");
  assert.equal(profile.emailVerified, true, "email OTP proves control of the mailbox");
});

test("unknown verifier without email_verified: accepted, but emailVerified stays false", async () => {
  // Sign-in is not refused outright (the identity pair is still bound by web3auth-auth.ts
  // step 1), but the address may not be used to backfill an email binding or take over a user.
  const profile = await verifyWeb3AuthIdToken(
    await sign({ email_verified: undefined, verifier: "discord", aggregateVerifier: "w3a-discord" }),
    opts,
  );
  assert.equal(profile.email, "ada@example.com");
  assert.equal(profile.emailVerified, false);
});

test("citadel v11 token with new claim names is mapped to verifier/verifierId/aggregateVerifier", async () => {
  const token = await sign(
    {
      iss: WEB3AUTH_CITADEL_ID_TOKEN_ISSUER,
      verifier: undefined,
      verifierId: undefined,
      aggregateVerifier: undefined,
      userId: "citadel-user-1",
      authConnectionId: "google-oauth2",
      groupedAuthConnectionId: "w3a-google",
    },
    { key: citadel.privateKey, kid: "citadel-1" },
  );

  const profile = await verifyWeb3AuthIdToken(token, citadelOpts);
  assert.equal(profile.email, "ada@example.com");
  assert.equal(profile.verifier, "google-oauth2");
  assert.equal(profile.verifierId, "citadel-user-1");
  assert.equal(profile.aggregateVerifier, "w3a-google");
  assert.equal(profile.emailVerified, true);
});

test("citadel v11 token with legacy claim names is still accepted", async () => {
  const token = await sign(
    { iss: WEB3AUTH_CITADEL_ID_TOKEN_ISSUER },
    { key: citadel.privateKey, kid: "citadel-1" },
  );

  const profile = await verifyWeb3AuthIdToken(token, citadelOpts);
  assert.equal(profile.verifier, "web3auth");
  assert.equal(profile.verifierId, "ada@example.com");
  assert.equal(profile.aggregateVerifier, "w3a-google");
});

test("citadel token with a foreign audience is rejected", async () => {
  const token = await sign(
    { iss: WEB3AUTH_CITADEL_ID_TOKEN_ISSUER, aud: "other-project" },
    { key: citadel.privateKey, kid: "citadel-1" },
  );
  await assert.rejects(verifyWeb3AuthIdToken(token, citadelOpts));
});

test("unknown issuer is rejected before any key is looked up", async () => {
  const token = await sign(
    { iss: "https://authjs.web3auth.io" },
    { key: citadel.privateKey, kid: "citadel-1" },
  );
  await assert.rejects(verifyWeb3AuthIdToken(token, citadelOpts), /id_token_unknown_issuer/);
});

test("citadel-iss token signed by the legacy key is rejected (key set routed by iss)", async () => {
  const token = await sign(
    { iss: WEB3AUTH_CITADEL_ID_TOKEN_ISSUER },
    { key: web3auth.privateKey, kid: "w3a-1" },
  );
  await assert.rejects(verifyWeb3AuthIdToken(token, citadelOpts));
});

test("legacy api-auth issuer still verifies through its own key set", async () => {
  const token = await sign({});
  const profile = await verifyWeb3AuthIdToken(token, { ...citadelOpts, keySet });
  assert.equal(profile.email, "ada@example.com");
  assert.equal(profile.verifier, "web3auth");
});

test("describeWeb3AuthIdTokenForLog exposes routing metadata but never the email", async () => {
  const token = await sign(
    { iss: WEB3AUTH_CITADEL_ID_TOKEN_ISSUER, email: "secret@example.com" },
    { key: citadel.privateKey, kid: "citadel-1" },
  );

  const info = describeWeb3AuthIdTokenForLog(token);
  assert.equal(info.kid, "citadel-1");
  assert.equal(info.alg, "ES256");
  assert.equal(info.iss, WEB3AUTH_CITADEL_ID_TOKEN_ISSUER);
  assert.equal(info.aud, CLIENT_ID);
  assert.deepEqual(info.claimNames, [...info.claimNames].sort(), "claim names are sorted");
  assert.ok(info.claimNames.includes("email"));

  const serialized = JSON.stringify(info);
  assert.equal(serialized.includes("secret@example.com"), false, "must not leak the email value");
  assert.equal(serialized.includes(token), false, "must not leak the token");
});

test("describeWeb3AuthIdTokenForLog never throws on a malformed token", () => {
  const info = describeWeb3AuthIdTokenForLog("not-a-jwt");
  assert.deepEqual(info.claimNames, []);
  assert.equal(info.iss, null);
  assert.equal(info.alg, null);
});
