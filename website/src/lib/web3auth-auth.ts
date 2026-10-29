import { and, eq } from "drizzle-orm";
import { getDbReady, isDatabaseConfigured } from "@/db";
import { accounts, users } from "@/db/schema";
import {
  describeWeb3AuthIdTokenForLog,
  verifyWeb3AuthIdToken,
  type Web3AuthProfile,
} from "@/lib/web3auth-id-token";
import { ensurePartner } from "@/lib/partner/service";
import { isVerifierAllowed } from "@/lib/web3auth-verifier-allowlist";
import { isDiscoverAdminEmail } from "@/lib/discover/admin-config";
import { blocksDangerousAccountLink } from "@/lib/wallet-link-guard";

/**
 * M02-5: Web3Auth accounts are bound by `(provider = verifier, providerAccountId =
 * verifierId)` in the shared Auth.js `accounts` table — the stable identity pair Web3Auth
 * guarantees — never by email alone. Two different Web3Auth identities (e.g. different
 * OAuth providers under an aggregate verifier) can share an email, so email can only be
 * used as a *one-time* backfill key: on the first login after this fix, a legacy user who
 * was previously bound by email alone gets an `accounts` row inserted for their
 * verifier+verifierId, and every login after that goes through the stable key. If the
 * email instead already belongs to a user who has a *different* verifierId already bound
 * under the same verifier, we refuse the login rather than guess — merging would either
 * silently hand that identity's session to the wrong account, or (since `user.email` is
 * unique) require fabricating a second account under a duplicate email.
 */
export async function bindWeb3AuthProfile(profile: Web3AuthProfile) {
  const db = await getDbReady();
  const email = profile.email.toLowerCase();
  const fallbackName = () => profile.name ?? email.split("@")[0];

  const verifier = profile.verifier;
  const verifierId = profile.verifierId;

  // Real Web3Auth tokens always carry verifier+verifierId. wallet-sessions.md #1 / recon.md R2:
  // a missing verifier/verifierId must never fall back to binding by email alone — refuse
  // instead of guessing an identity.
  if (!verifier || !verifierId) {
    console.warn("[auth] web3auth sign-in refused: token is missing verifier/verifierId", { email });
    return null;
  }

  // Fail closed unless this verifier (or its aggregateVerifier) is on the allowlist — see
  // web3auth-verifier-allowlist.ts. Applied unconditionally, before the "already bound" fast
  // path too, so that disabling a verifier later also locks out any pre-existing bindings
  // under it.
  if (!isVerifierAllowed(verifier, profile.aggregateVerifier)) {
    return null;
  }

  // 1) Stable identity key already bound: reuse the same user regardless of what email the
  //    upstream provider reports today (we never overwrite the stored row from the token).
  const bound = await db.query.accounts.findFirst({
    where: and(eq(accounts.provider, verifier), eq(accounts.providerAccountId, verifierId)),
  });
  if (bound) {
    const user = await db.query.users.findFirst({ where: eq(users.id, bound.userId) });
    if (user) {
      await ensurePartner(user.id);
      return { id: user.id, email: user.email ?? email, name: user.name ?? fallbackName() };
    }
    // Orphaned accounts row (user deleted out-of-band); fall through and treat this as a
    // fresh identity below.
  }

  // 2) No binding yet for this verifier+verifierId. Fall back to email, but only to attach
  //    to a user that has never had a *different* Web3Auth identity bound — otherwise this
  //    is exactly the email-collision the fix is for.
  //
  //    api-cron.md M1: the email backfill additionally requires the token to assert a verified
  //    email, and is refused outright for any `DISCOVER_ADMIN_EMAILS` address. Without this an
  //    attacker could point a Web3Auth connection at an admin's address and inherit the admin
  //    account (and, via the vault, its wrap key). Admins are re-attached by userId
  //    (`DISCOVER_ADMIN_USER_IDS`) or by signing in through Google, never through Web3Auth email.
  if (profile.emailVerified !== true) {
    console.warn("[auth] web3auth sign-in refused: unverified email claim on new identity", { verifier, email });
    return null;
  }
  if (isDiscoverAdminEmail(email)) {
    console.warn("[auth] web3auth sign-in refused: email is on the admin allowlist", { verifier, email });
    return null;
  }
  const existingByEmail = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existingByEmail) {
    const conflictingAccount = await db.query.accounts.findFirst({
      where: and(eq(accounts.userId, existingByEmail.id), eq(accounts.provider, verifier)),
    });
    if (conflictingAccount) {
      // Someone else's email, different stable identity: refuse rather than take over.
      // `authorize()` turns this into a bare "CredentialsSignin" with no detail, so the
      // reason is only ever visible here — log it or a refused owner login is undebuggable.
      console.warn(
        "[auth] web3auth sign-in refused: email already bound to a different identity under this verifier",
        { verifier, email },
      );
      return null;
    }
    // AUDIT M1: Web3Auth goes through Credentials, so the Auth.js `signIn` callback never runs
    // `blocksDangerousAccountLink` for it (that check is gated on `account.type === "oauth"`).
    // Apply the same wallet-owning-account guard here before attaching a new identity by email.
    const blocked = await blocksDangerousAccountLink({
      provider: verifier,
      providerAccountId: verifierId,
      email,
    });
    if (blocked) {
      console.warn("[auth] web3auth sign-in refused: email belongs to a wallet-owning account", { verifier, email });
      return null;
    }
    await db.insert(accounts).values({
      userId: existingByEmail.id,
      type: "oidc",
      provider: verifier,
      providerAccountId: verifierId,
    });
    await ensurePartner(existingByEmail.id);
    return {
      id: existingByEmail.id,
      email: existingByEmail.email ?? email,
      name: existingByEmail.name ?? fallbackName(),
    };
  }

  // 3) Brand new identity and email: create the user and bind it in one shot.
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email,
    name: fallbackName(),
    emailVerified: new Date(),
    image: null,
  });
  await db.insert(accounts).values({
    userId: id,
    type: "oidc",
    provider: verifier,
    providerAccountId: verifierId,
  });
  await ensurePartner(id);
  return { id, email, name: fallbackName() };
}

export async function authorizeWeb3AuthIdToken(idToken: string) {
  if (!isDatabaseConfigured()) return null;
  let profile: Web3AuthProfile;
  try {
    profile = await verifyWeb3AuthIdToken(idToken);
  } catch (error) {
    // `authorize()` maps every failure here to the same bare "CredentialsSignin": an
    // expired/replayed token looks identical to a JWKS fetch failure without this line.
    console.warn(
      "[auth] web3auth idToken verification failed",
      error instanceof Error ? error.message : error,
      describeWeb3AuthIdTokenForLog(idToken),
    );
    return null;
  }
  return bindWeb3AuthProfile(profile);
}
