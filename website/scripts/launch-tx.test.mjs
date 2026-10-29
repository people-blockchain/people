import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createTokenLaunchTxStore, outcomeOfReceipt, planTokenRestore } from "../src/lib/launch-tx.ts";
import { pendingDraftTx, restoreFromReceipt } from "../src/lib/nft-mint-draft.ts";

const OWNER = "0x1111111111111111111111111111111111111111";
const HASH = `0x${"ab".repeat(32)}`;
const record = (patch = {}) => ({ version: 1, owner: OWNER, stage: "create", hash: HASH, name: "Quest", symbol: "QST", supply: "1000", ...patch });

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k), map };
}

test("a receipt maps to success, failed or pending; a missing receipt never reads as a failure", () => {
  assert.equal(outcomeOfReceipt({ status: "success" }), "success");
  assert.equal(outcomeOfReceipt({ status: "0x1" }), "success");
  assert.equal(outcomeOfReceipt({ status: "reverted" }), "failed");
  assert.equal(outcomeOfReceipt({ status: "0x0" }), "failed");
  assert.equal(outcomeOfReceipt(null), "pending");
  assert.equal(outcomeOfReceipt(undefined), "pending");
});

test("token restore: create confirms, pay is already counted, a revert is a failure, no receipt keeps waiting", () => {
  assert.equal(planTokenRestore("create", "success"), "created");
  assert.equal(planTokenRestore("pay", "success"), "payment_counted");
  assert.equal(planTokenRestore("create", "failed"), "failed");
  assert.equal(planTokenRestore("pay", "failed"), "failed");
  assert.equal(planTokenRestore("create", "pending"), "pending");
  assert.equal(planTokenRestore("pay", "pending"), "pending");
});

test("tx store: the hash survives a reload, belongs to one wallet and can be cleared", () => {
  const storage = memoryStorage();
  const store = createTokenLaunchTxStore(() => storage);
  store.save(record());
  // a new store instance is a reloaded page: only localStorage carries the hash
  const reloaded = createTokenLaunchTxStore(() => storage);
  assert.deepEqual(reloaded.load(OWNER), record());
  assert.equal(reloaded.load("0x2222222222222222222222222222222222222222"), null);
  reloaded.clear(OWNER);
  assert.equal(reloaded.load(OWNER), null);
  assert.equal(storage.map.size, 0);
});

test("tx store: corrupt or foreign data is ignored; broken storage degrades to memory", () => {
  const storage = memoryStorage();
  const store = createTokenLaunchTxStore(() => storage);
  const key = [...(store.save(record()), storage.map.keys())][0];
  storage.map.set(key, "{not json");
  assert.equal(store.load(OWNER), null);
  storage.map.set(key, JSON.stringify(record({ hash: "0x1234" })));
  assert.equal(store.load(OWNER), null);
  storage.map.set(key, JSON.stringify(record({ stage: "other" })));
  assert.equal(store.load(OWNER), null);

  const broken = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
    removeItem: () => {
      throw new Error("denied");
    },
  };
  const memoryOnly = createTokenLaunchTxStore(() => broken);
  memoryOnly.save(record());
  assert.deepEqual(memoryOnly.load(OWNER), record());
  memoryOnly.clear(OWNER);
  assert.equal(memoryOnly.load(OWNER), null);
  assert.equal(createTokenLaunchTxStore(() => null).load(OWNER), null);
});

const draft = (patch = {}) => ({
  version: 1,
  owner: OWNER,
  status: "in_progress",
  mode: "single",
  kind: "image",
  name: "Badge",
  tokenUri: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/metadata.json",
  imagePreviewUrl: "https://gateway.example.org/ipfs/x",
  payWith: "USDC",
  ...patch,
});

test("nft draft: the newest unfinished hash is the one checked on return", () => {
  assert.equal(pendingDraftTx(draft()), null);
  assert.deepEqual(pendingDraftTx(draft({ payTx: "0xp" })), { step: "pay", hash: "0xp" });
  assert.deepEqual(pendingDraftTx(draft({ payTx: "0xp", payDone: true, createTx: "0xc" })), { step: "create", hash: "0xc" });
  assert.deepEqual(pendingDraftTx(draft({ payTx: "0xp", createTx: "0xc", collection: "0xabc", mintTx: "0xm" })), { step: "mint", hash: "0xm" });
  assert.equal(pendingDraftTx(draft({ payWith: "PPL", payTx: "0xp" })), null);
  assert.equal(pendingDraftTx(draft({ status: "done", mintTx: "0xm" })), null);
});

test("nft draft: a confirmed payment is marked done, a reverted hash is dropped so the retry sends a new one", () => {
  assert.deepEqual(restoreFromReceipt("pay", "success"), { patch: { payDone: true }, notice: "payment_counted", mintSucceeded: false });
  assert.deepEqual(restoreFromReceipt("pay", "failed"), { patch: { payTx: undefined }, notice: "failed", mintSucceeded: false });
  assert.deepEqual(restoreFromReceipt("create", "failed"), { patch: { createTx: undefined }, notice: "failed", mintSucceeded: false });
  assert.deepEqual(restoreFromReceipt("mint", "failed"), { patch: { mintTx: undefined, mintAttempted: undefined }, notice: "failed", mintSucceeded: false });
  assert.equal(restoreFromReceipt("mint", "success").mintSucceeded, true);
  assert.deepEqual(restoreFromReceipt("create", "success"), { patch: {}, notice: null, mintSucceeded: false });
  for (const step of ["pay", "create", "mint"]) {
    assert.deepEqual(restoreFromReceipt(step, "pending"), { patch: {}, notice: null, mintSucceeded: false });
  }
});

test("the three restore strings exist in all 12 locales and are translated", () => {
  const langs = ["en", "ru", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];
  const read = (lang) => JSON.parse(readFileSync(new URL(`../src/lib/locales/surfaces/nft-media-${lang}.json`, import.meta.url), "utf8"));
  const en = read("en");
  for (const lang of langs) {
    const copy = read(lang);
    for (const key of ["txRestoring", "txPaymentCounted", "txFailedBefore"]) {
      assert.ok(typeof copy[key] === "string" && copy[key].length > 10, `${lang}.${key}`);
      if (lang !== "en") assert.notEqual(copy[key], en[key], `${lang}.${key} is still English`);
    }
  }
});

test("forms: a rejected file is not shown as a failed submit, and the hash is stored before the receipt wait", () => {
  const src = (name) => readFileSync(new URL(`../src/components/factory/${name}`, import.meta.url), "utf8");
  const wizard = src("FactoryWizard.tsx");
  assert.match(wizard, /setUploadError\(uploadErrorMessage\(tooBig/);
  assert.doesNotMatch(wizard, /setError\(uploadErrorMessage/);
  const nft = src("EvmNftMint.tsx");
  assert.equal((nft.match(/setErrorFrom\("pick"\)/g) ?? []).length, 2);
  assert.match(nft, /errorFrom === "pick" \? errorText/);
  const token = src("EvmTokenLaunch.tsx");
  assert.ok(token.indexOf('remember("create", hash)') < token.indexOf("waitForCreateReceipt(client, hash)"));
  assert.ok(token.indexOf('remember("pay", payHash)') < token.indexOf("waitForTransactionReceipt({ hash: payHash })"));
});
