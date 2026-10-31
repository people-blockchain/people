// Public Anvil/Hardhat development keys only (well-known, zero real value).
// Account #0 and #1 from the default mnemonic, path m/44'/60'/0'/0/n.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { keyFromPrivate } from "../src/lib/people-sign.ts";
import { keyPairFromMnemonic, previewWalletImport } from "../src/lib/wallet-seed.ts";
import {
  addressMatchesPublicKey,
  evmAddressFromPublicKey,
  getWalletAddressScheme,
  legacyAddressFromPublicKey,
  readWalletAddressSchemeConfig,
} from "../src/lib/wallet-address-scheme.ts";
import {
  deriveUserWrapKeyHex,
  encryptPrivateKeyForVault,
} from "../src/lib/wallet-cloud-crypto.ts";
import { unlockCloudVaultSession } from "../src/lib/wallet-cloud-client.ts";

const HH0 = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const HH0_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const HH1 = "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const HH1_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const MNEMONIC = "test test test test test test test test test test test junk";

async function withChainEnv(vars, fn) {
  const keys = ["NEXT_PUBLIC_CHAIN", "NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES"];
  const prev = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return await fn();
  } finally {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

test("EVM chain uses the keccak address for Hardhat account 0 and 1", async () => {
  await withChainEnv({}, () => {
    assert.equal(readWalletAddressSchemeConfig(), "evm");
    assert.equal(getWalletAddressScheme(), "evm");
    assert.equal(keyFromPrivate(HH0).address, HH0_ADDRESS);
    assert.equal(keyFromPrivate(HH1).address, HH1_ADDRESS);
    assert.equal(keyFromPrivate(HH0).address, privateKeyToAccount(`0x${HH0}`).address);
    assert.equal(keyFromPrivate(HH1).address, privateKeyToAccount(`0x${HH1}`).address);
  });
});

test("private key import accepts 0x, 0X, surrounding spaces, and uppercase hex", async () => {
  await withChainEnv({}, () => {
    const variants = [
      HH0,
      `0x${HH0}`,
      `0X${HH0.toUpperCase()}`,
      `  ${HH0.toUpperCase()}  `,
      `\n0x${HH0}\n`,
    ];
    for (const input of variants) {
      assert.equal(keyFromPrivate(input).address, HH0_ADDRESS);
    }
  });
});

test("invalid private key length or non-hex is a clear error", async () => {
  await withChainEnv({}, () => {
    for (const bad of ["", "0x", HH0.slice(0, 63), `${HH0}ff`, `0x${HH0}ff`, "zz".repeat(32), `  ${HH0.slice(0, 32)} ${HH0.slice(32)}`]) {
      assert.throws(() => keyFromPrivate(bad), /invalid_private_key/);
    }
  });
});

test("import preview shows the derived address before confirm", async () => {
  await withChainEnv({}, () => {
    const fromKey = previewWalletImport(`  0X${HH0.toUpperCase()}  `);
    assert.ok(fromKey && "address" in fromKey);
    assert.equal(fromKey.address, HH0_ADDRESS);
    const fromPhrase = previewWalletImport(`  ${MNEMONIC.toUpperCase()}  `);
    assert.ok(fromPhrase && "address" in fromPhrase);
    assert.equal(fromPhrase.address, HH0_ADDRESS);
    assert.equal(previewWalletImport(""), null);
    assert.equal(previewWalletImport('  {"version":1}'), null);
    assert.deepEqual(previewWalletImport("not-a-key"), { error: "invalid_private_key" });
  });
});

test("default mnemonic path m/44'/60'/0'/0/0 is Hardhat account 0", async () => {
  await withChainEnv({}, () => {
    assert.equal(keyPairFromMnemonic(MNEMONIC).address, HH0_ADDRESS);
    assert.equal(keyPairFromMnemonic(`  ${MNEMONIC.toUpperCase()} \n`).address, HH0_ADDRESS);
    assert.equal(keyPairFromMnemonic(MNEMONIC).address, keyFromPrivate(HH0).address);
  });
});

test("legacy network keeps sha256 addresses until canonical mode is requested", async () => {
  await withChainEnv({ NEXT_PUBLIC_CHAIN: "people-node" }, () => {
    assert.equal(readWalletAddressSchemeConfig(), "legacy");
    assert.equal(getWalletAddressScheme(), "legacy");
    const key = keyFromPrivate(HH0);
    assert.equal(key.address, legacyAddressFromPublicKey(key.publicKey));
    assert.notEqual(key.address.toLowerCase(), HH0_ADDRESS.toLowerCase());
  });
  await withChainEnv({ NEXT_PUBLIC_CHAIN: "people-node", NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES: "evm" }, () => {
    assert.equal(getWalletAddressScheme(), "evm");
    assert.equal(keyFromPrivate(HH0).address, HH0_ADDRESS);
  });
  await withChainEnv({ NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES: "legacy" }, () => {
    assert.equal(getWalletAddressScheme(), "evm");
    assert.equal(evmAddressFromPublicKey(keyFromPrivate(HH0).publicKey), HH0_ADDRESS);
  });
});

test("a stored legacy vault address still opens onto the EVM address of the same key", async () => {
  await withChainEnv({}, async () => {
    const key = keyFromPrivate(HH0);
    const legacy = legacyAddressFromPublicKey(key.publicKey);
    assert.notEqual(legacy.toLowerCase(), key.address.toLowerCase());
    assert.equal(addressMatchesPublicKey(legacy, key.publicKey), true);
    const wrapKeyHex = await deriveUserWrapKeyHex("vault-wrap-secret", "user-legacy");
    const encryptedPrivateKey = await encryptPrivateKeyForVault(key.privateKey, wrapKeyHex);
    globalThis.fetch = async (url) => {
      if (String(url).includes("/wrap-key")) {
        return Response.json({ wrapKeyHex });
      }
      return Response.json({
        address: legacy,
        publicKey: key.publicKey,
        encryptedPrivateKey,
      });
    };
    const session = await unlockCloudVaultSession("user-legacy");
    assert.equal(session.address, HH0_ADDRESS);
    assert.equal(session.privateKey, key.privateKey);
  });
});

test("import copy names the derived address in every locale", () => {
  const languages = ["en", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];
  const read = (lang) =>
    JSON.parse(readFileSync(new URL(`../src/lib/locales/surfaces/wallet-${lang}.json`, import.meta.url), "utf8"));
  const en = read("en");
  assert.match(en.importAddress, /address/i);
  assert.match(en.importInvalidKey, /64/);
  for (const lang of languages) {
    const copy = read(lang);
    assert.equal(typeof copy.importAddress, "string");
    assert.ok(copy.importAddress.trim(), `${lang}.importAddress`);
    assert.equal(typeof copy.importInvalidKey, "string");
    assert.ok(copy.importInvalidKey.trim(), `${lang}.importInvalidKey`);
    if (lang !== "en") {
      assert.notEqual(copy.importAddress, en.importAddress, `${lang}.importAddress`);
      assert.notEqual(copy.importInvalidKey, en.importInvalidKey, `${lang}.importInvalidKey`);
    }
  }
  const source = readFileSync(new URL("../src/lib/wallet-copy.ts", import.meta.url), "utf8");
  assert.match(source, /importAddress:/);
  assert.match(source, /Адрес, который будет импортирован/);
  const panel = readFileSync(new URL("../src/components/wallet/WalletConnectPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /importAddress/);
  assert.match(panel, /importInvalidKey/);
});
