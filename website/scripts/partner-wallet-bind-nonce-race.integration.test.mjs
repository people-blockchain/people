// wallet-sessions.md #7: bindWallet() used to clear the challenge nonce with a plain UPDATE.
// Two concurrent requests holding the same still-valid nonce could both pass verification and
// both "win". The fix makes the final UPDATE conditional on the exact nonce just read, so only
// one concurrent caller can ever consume it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./fixtures/referral-db-loader.mjs", import.meta.url);

const { getDbReady } = await import("./fixtures/referral-pglite-db.mjs");
const db = await getDbReady();
const schema = await import("../src/db/schema.ts");
const { issueWalletChallenge, bindWallet, ensurePartner } = await import("../src/lib/partner/service.ts");
const { generateWalletKeyPair, buildWalletBindProof } = await import("../src/lib/partner/wallet.ts");

const ORIGIN = "https://www.peopleblockchain.network";

let seq = 0;
async function mkUser() {
  seq += 1;
  const id = `bindrace-u${seq}`;
  const email = `bindrace${seq}@example.com`;
  await db.insert(schema.users).values({ id, email });
  await ensurePartner(id);
  return { id, email };
}

test("only one of two concurrent bindWallet calls sharing the same nonce succeeds", async () => {
  const user = await mkUser();
  const challenge = await issueWalletChallenge(user.id, user.email, ORIGIN);
  const keys = generateWalletKeyPair();
  const proof = buildWalletBindProof(keys.privateKey, challenge.message);

  const [first, second] = await Promise.all([
    bindWallet(user.id, user.email, ORIGIN, proof),
    bindWallet(user.id, user.email, ORIGIN, proof),
  ]);

  const outcomes = [first, second];
  const successes = outcomes.filter((r) => r.ok);
  const failures = outcomes.filter((r) => !r.ok);
  assert.equal(successes.length, 1, "exactly one concurrent call must win the race");
  assert.equal(failures.length, 1);
  assert.equal(failures[0].error, "challenge_expired");
});

test("a second bindWallet call with an already-consumed nonce fails cleanly (sequential, not just concurrent)", async () => {
  const user = await mkUser();
  const challenge = await issueWalletChallenge(user.id, user.email, ORIGIN);
  const keys = generateWalletKeyPair();
  const proof = buildWalletBindProof(keys.privateKey, challenge.message);

  const first = await bindWallet(user.id, user.email, ORIGIN, proof);
  assert.equal(first.ok, true);

  const second = await bindWallet(user.id, user.email, ORIGIN, proof);
  assert.equal(second.ok, false);
  assert.equal(second.error, "challenge_expired");
});
