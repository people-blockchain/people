import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { turnkeyWalletCopy } from "../src/lib/turnkey-wallet-copy.ts";
import { peopleChainPublicName } from "../src/lib/people-chain-names.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("Turnkey public copy is English and never calls 97400 a testnet", () => {
  const blob = Object.values(turnkeyWalletCopy).join("\n");
  assert.match(blob, /People Wallet/);
  assert.doesNotMatch(blob, /testnet/i);
  assert.equal(peopleChainPublicName(97400), "PEOPLE Mainnet Beta");
  const doc = readFileSync(join(root, "docs/TURNKEY-WALLET.md"), "utf8");
  assert.match(doc, /WALLET_PROVIDER/);
  assert.match(doc, /legacy_address_mismatch/);
  assert.match(doc, /PEOPLE Mainnet Beta/);
  assert.doesNotMatch(doc, /97400[^\n]*testnet/i);
});
