import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const localeDir = join(root, "src/lib/locales/surfaces");
const locales = readdirSync(localeDir)
  .filter((name) => name.startsWith("partner-") && name.endsWith(".json"))
  .map((name) => name.replace(/^partner-/, "").replace(/\.json$/, ""));

const ENV_KEYS = [
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AUTH_RESEND_KEY",
  "NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED",
  "NEXT_PUBLIC_CLOUD_WALLET_ENABLED",
];

function withEnv(values, fn) {
  const previous = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, values);
  try {
    return fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("Google is configured from credentials alone, with the social kill-switch off", async () => {
  const { isGoogleConfigured } = await import("../src/lib/partner/guards.ts");
  withEnv({ AUTH_GOOGLE_ID: "test-google-id", AUTH_GOOGLE_SECRET: "test-google-secret" }, () => {
    assert.equal(process.env.NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED, undefined);
    assert.equal(isGoogleConfigured(), true);
  });
});

test("Google stays unconfigured without credentials", async () => {
  const { isGoogleConfigured } = await import("../src/lib/partner/guards.ts");
  withEnv({}, () => {
    assert.equal(isGoogleConfigured(), false);
  });
});

test("/api/auth/features exposes google/magic without the cloud-wallet flag", async () => {
  const { GET } = await import("../src/app/api/auth/features/route.ts");
  await withEnv(
    {
      AUTH_SECRET: "test-auth-secret",
      DATABASE_URL: "postgres://user:pass@127.0.0.1:9/test",
      AUTH_GOOGLE_ID: "test-google-id",
      AUTH_GOOGLE_SECRET: "test-google-secret",
      AUTH_RESEND_KEY: "re_test_key",
    },
    async () => {
      const response = await GET();
      const body = await response.json();
      assert.equal(body.auth, true);
      assert.equal(body.google, true);
      assert.equal(body.magic, true);
      assert.equal(body.cloudWallet, false, "cloudWallet must stay false while the flag is off");
    },
  );
});

test("/api/auth/features keeps cloudWallet false and hides providers when unconfigured", async () => {
  const { GET } = await import("../src/app/api/auth/features/route.ts");
  await withEnv({ AUTH_SECRET: "test-auth-secret", DATABASE_URL: "postgres://user:pass@127.0.0.1:9/test" }, async () => {
    const body = await (await GET()).json();
    assert.equal(body.google, false);
    assert.equal(body.magic, false);
    assert.equal(body.cloudWallet, false);
  });
});

test("LoginForm gates session sign-in on providers, not the cloud-wallet flag", () => {
  const form = read("src/app/login/LoginForm.tsx");
  assert.doesNotMatch(form, /isCloudWalletEnabled/);
  assert.doesNotMatch(form, /cloudEnabled/);
  assert.match(form, /SessionSignInPanel/);
  assert.match(form, /web3AuthEnabled \|\| sessionSignInEnabled/);
  // Web3Auth remains a separate branch and still renders only through UnifiedWalletAuthPanel.
  assert.match(form, /authAvailable && web3AuthEnabled/);
  assert.match(form, /authAvailable && !web3AuthEnabled/);
});

test("SessionSignInPanel uses Auth.js only and never touches a cloud vault", () => {
  const panel = read("src/components/wallet/SessionSignInPanel.tsx");
  assert.match(panel, /signIn\("google"/);
  assert.match(panel, /signIn\("resend"/);
  assert.match(panel, /readLastAuthEmail/);
  assert.match(panel, /rememberAuthEmail/);
  for (const forbidden of [
    "ensureCloudWalletSession",
    "connectCloud",
    "sync-vault",
    "WalletContext",
    "useWallet",
    "runParticipantRegistration",
    "participant-registration",
    "WalletCloudSignIn",
    "wallet-cloud-client",
  ]) {
    assert.doesNotMatch(panel, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), forbidden);
  }
});

test("verified-email account linking and check-email page are unchanged", () => {
  const config = read("src/auth.config.ts");
  assert.match(config, /allowDangerousEmailAccountLinking:\s*true/);
  assert.match(config, /email_verified !== true/);
  assert.match(config, /blocksDangerousAccountLink/);
  assert.match(config, /verifyRequest:\s*"\/login\/check-email"/);
  const checkEmail = read("src/app/login/check-email/page.tsx");
  assert.match(checkEmail, /checkEmailTitle/);
  assert.match(checkEmail, /\/login/);
});

test("partner copy tells the truth about session sign-in in every locale", () => {
  for (const lang of locales) {
    const copy = JSON.parse(read(`src/lib/locales/surfaces/partner-${lang}.json`));
    for (const key of ["sessionSignInHeading", "sessionSignInLead", "googleCta", "magicCta"]) {
      assert.equal(typeof copy[key], "string", `${lang}.${key}`);
      assert.ok(copy[key].trim().length > 0, `${lang}.${key} empty`);
    }
    assert.match(copy.googleCta, /Google/, `${lang}.googleCta must name Google`);
    assert.match(copy.guestLandingLead, /Google/, `${lang}.guestLandingLead must name Google or email sign-in`);
    assert.match(copy.guestWalletHint, /Google/, `${lang}.guestWalletHint must name Google or email sign-in`);
    assert.doesNotMatch(copy.guestLandingLead, /create or connect a wallet/i, `${lang}.guestLandingLead`);
    assert.doesNotMatch(copy.guestWalletHint, /входе\s*\./, `${lang}.guestWalletHint must name the sign-in method`);
    if (lang !== "ru") {
      assert.doesNotMatch(copy.sessionSignInLead, /[Ѐ-ӿ]/, `${lang} must not contain Cyrillic`);
    }
  }
});
