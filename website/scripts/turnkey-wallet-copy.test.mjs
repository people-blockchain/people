import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { turnkeyWalletCopy } from "../src/lib/turnkey-wallet-copy.ts";
import { peopleChainPublicName } from "../src/lib/people-chain-names.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const languages = ["en", "ru", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];

test("Turnkey public copy never calls 97400 a testnet", () => {
  const blob = Object.values(turnkeyWalletCopy).join("\n");
  assert.match(blob, /People Wallet/);
  assert.doesNotMatch(blob, /testnet/i);
  assert.equal(peopleChainPublicName(97400), "PEOPLE Mainnet Beta");
  const doc = readFileSync(join(root, "docs/TURNKEY-WALLET.md"), "utf8");
  assert.match(doc, /WALLET_PROVIDER/);
  assert.match(doc, /legacy_address_mismatch/);
  assert.match(doc, /PEOPLE Mainnet Beta/);
  assert.match(doc, /0027_user_turnkey_wallet/);
  assert.match(doc, /Upgrade your wallet/);
  assert.match(doc, /EXPORT_WALLET_ACCOUNT/);
  assert.match(doc, /encryptedOtpBundle/);
  assert.doesNotMatch(doc, /97400[^\n]*testnet/i);
});

test("Upgrade your wallet and Export private key exist in all site languages", () => {
  for (const lang of languages) {
    const copy = JSON.parse(
      readFileSync(join(root, "src/lib/locales/surfaces", `wallet-ux-${lang}.json`), "utf8"),
    );
    assert.equal(typeof copy.upgradeWalletTitle, "string");
    assert.ok(copy.upgradeWalletTitle.trim());
    assert.equal(typeof copy.upgradeWalletStatusFailed, "string");
    assert.ok(copy.upgradeWalletStatusFailed.trim());
    assert.equal(typeof copy.upgradeWalletRetry, "string");
    assert.ok(copy.upgradeWalletRetry.trim());
    assert.equal(typeof copy.exportPrivateKeyCta, "string");
    assert.ok(copy.exportPrivateKeyCta.trim());
    assert.doesNotMatch(copy.upgradeWalletLead, /testnet/i);
    assert.doesNotMatch(copy.exportPrivateKeyWarning, /testnet/i);
  }
  const en = JSON.parse(readFileSync(join(root, "src/lib/locales/surfaces/wallet-ux-en.json"), "utf8"));
  assert.equal(en.upgradeWalletTitle, "Upgrade your wallet");
  assert.equal(en.exportPrivateKeyCta, "Export private key");
});
