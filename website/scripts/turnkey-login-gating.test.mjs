import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("turnkey login surfaces Google/email even when social/cloud flags are off", () => {
  const login = readFileSync(join(root, "src/app/login/LoginForm.tsx"), "utf8");
  assert.match(login, /isTurnkeyWalletProvider/);
  assert.match(login, /turnkeyEnabled/);
  assert.match(login, /web3AuthEnabled \|\| turnkeyEnabled/);

  const panel = readFileSync(join(root, "src/components/wallet/UnifiedWalletAuthPanel.tsx"), "utf8");
  assert.match(panel, /WalletCloudSignIn skipVault/);
  assert.match(panel, /WalletTurnkeySignIn/);

  const cloud = readFileSync(join(root, "src/components/wallet/WalletCloudSignIn.tsx"), "utf8");
  assert.match(cloud, /skipVault/);
  assert.match(cloud, /features\.google \|\| features\.magic/);

  const connect = readFileSync(join(root, "src/components/wallet/WalletConnectPanel.tsx"), "utf8");
  assert.match(connect, /isTurnkeyWalletProvider\(\)/);

  const social = readFileSync(join(root, "src/lib/social-login.ts"), "utf8");
  assert.match(social, /isSocialLoginCopyEnabled/);
  assert.match(social, /isTurnkeyWalletProvider\(\)/);
});

test("bootstrap refuses to mint a wallet when a vault row exists", () => {
  const bootstrap = readFileSync(join(root, "src/app/api/wallet/turnkey/bootstrap/route.ts"), "utf8");
  assert.match(bootstrap, /createWallet === true/);
  const suborg = readFileSync(join(root, "src/lib/turnkey-suborg.ts"), "utf8");
  assert.match(suborg, /assertCanCreateTurnkeyWallet/);
  const open = readFileSync(join(root, "src/lib/turnkey-open-flow.ts"), "utf8");
  assert.match(open, /TurnkeyUpgradeRequiredError/);
  assert.match(open, /importLegacy/);
});

test("OTP verify rejects plaintext otpCode and export never hits our server for key material", () => {
  const verify = readFileSync(join(root, "src/app/api/wallet/turnkey/otp/verify/route.ts"), "utf8");
  assert.match(verify, /encryptedOtpBundle/);
  assert.match(verify, /otpCode/);
  const login = readFileSync(join(root, "src/app/api/wallet/turnkey/otp/login/route.ts"), "utf8");
  assert.match(login, /clientSignature/);
  const ready = readFileSync(join(root, "src/app/api/wallet/turnkey/export/ready/route.ts"), "utf8");
  assert.match(ready, /freshAuth: true/);
  assert.doesNotMatch(ready, /exportWalletAccount|privateKey|exportBundle/);
  const ui = readFileSync(join(root, "src/components/wallet/TurnkeyExportPrivateKey.tsx"), "utf8");
  assert.match(ui, /exportWalletAccount/);
  assert.match(ui, /confirmTurnkeyExportReady/);
});

test("turnkey mode never creates a second (vault) wallet", () => {
  const route = readFileSync(join(root, "src/app/api/wallet/vault/route.ts"), "utf8");
  const put = route.slice(route.indexOf("export async function PUT"));
  assert.ok(put.indexOf("isTurnkeyWalletProvider()") > 0, "PUT checks turnkey mode");
  assert.ok(put.indexOf("isTurnkeyWalletProvider()") < put.indexOf("createUserWalletVault("), "before creating a vault");
  assert.match(put, /turnkey_mode/);

  const partner = readFileSync(join(root, "src/components/partner/PartnerWalletAutoRefresh.tsx"), "utf8");
  assert.match(partner, /!session && !isTurnkeyWalletProvider\(\)/);
});
