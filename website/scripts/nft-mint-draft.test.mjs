import assert from "node:assert/strict";
import test from "node:test";
import {
  applyConfirmedMint,
  createDraftStore,
  isResumable,
  planResume,
  releaseMintAttempt,
  shouldReleaseAttempt,
  showsResumeNotice,
} from "../src/lib/nft-mint-draft.ts";

const OWNER = "0x1111111111111111111111111111111111111111";
const base = () => ({
  version: 1,
  owner: OWNER,
  status: "saved",
  mode: "single",
  kind: "image",
  name: "Badge",
  tokenUri: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/metadata.json",
  imagePreviewUrl: "https://gateway.example.org/ipfs/x",
  payWith: "PPL",
});
const SEND = ["pay", "create", "mint"];

test("a fresh single-item draft creates the collection, then mints", () => {
  assert.deepEqual(planResume(base()), ["create", "mint", "wait_mint"]);
});

test("a draft with a mint hash only waits and never sends", () => {
  const steps = planResume({ ...base(), status: "in_progress", collection: "0xabc", createTx: "0x1", mintTx: "0x2", mintAttempted: true });
  assert.deepEqual(steps, ["wait_mint"]);
  assert.ok(!steps.some((step) => SEND.includes(step)));
});

test("a known collection skips create; a known create hash waits for it instead of re-sending", () => {
  assert.deepEqual(planResume({ ...base(), collection: "0xabc" }), ["mint", "wait_mint"]);
  assert.deepEqual(planResume({ ...base(), createTx: "0x1" }), ["wait_create", "mint", "wait_mint"]);
  assert.deepEqual(planResume({ ...base(), mode: "collection" }), ["mint", "wait_mint"]);
});

test("a possibly-sent mint checks for an existing token before sending again", () => {
  assert.deepEqual(planResume({ ...base(), collection: "0xabc", mintAttempted: true }), ["check_existing", "mint", "wait_mint"]);
});

test("stablecoin payment is paid once: a pay hash is awaited, a finished payment is skipped", () => {
  assert.deepEqual(planResume({ ...base(), payWith: "USDC" }), ["pay", "create", "mint", "wait_mint"]);
  assert.deepEqual(planResume({ ...base(), payWith: "USDC", payTx: "0x9" }), ["wait_pay", "create", "mint", "wait_mint"]);
  assert.deepEqual(planResume({ ...base(), payWith: "USDC", payTx: "0x9", payDone: true }), ["create", "mint", "wait_mint"]);
});

test("a done draft only shows the result", () => {
  assert.deepEqual(planResume({ ...base(), status: "done", mintTx: "0x2", collection: "0xabc" }), ["show_result"]);
});

test("success and a finished failure clear the in-progress notice", () => {
  const open = {
    ...base(),
    status: "in_progress",
    collection: "0xabc",
    createTx: "0x1",
    mintTx: "0x2",
    mintAttempted: true,
  };
  assert.equal(showsResumeNotice(open, false), true);
  // The click that is already running is guarded by the lock, not by this notice.
  assert.equal(showsResumeNotice(open, true), false);
  const done = applyConfirmedMint(open, "0", "0x2");
  assert.equal(done.status, "done");
  assert.equal(showsResumeNotice(done, false), false);
  assert.equal(isResumable(done), false);
  const failed = releaseMintAttempt(open, true);
  assert.equal(failed.status, "saved");
  assert.equal(failed.mintAttempted, false);
  assert.equal(failed.mintTx, undefined);
  assert.equal(failed.collection, "0xabc");
  assert.equal(failed.createTx, "0x1");
  assert.equal(showsResumeNotice(failed, false), false);
  assert.equal(shouldReleaseAttempt("wallet_rejected", open), true);
  assert.equal(shouldReleaseAttempt("receipt_failed", open), true);
  assert.equal(shouldReleaseAttempt("timeout", open), false);
  assert.equal(shouldReleaseAttempt("network", open), false);
  assert.equal(shouldReleaseAttempt("unknown", open), false);
  assert.equal(shouldReleaseAttempt("unknown", base()), true);
});

test("a confirmed mint closes the draft so the resume notice cannot return", () => {
  const open = { ...base(), status: "in_progress", collection: "0xabc", mintTx: "0x2", mintAttempted: true };
  assert.equal(isResumable(open), true);
  const done = applyConfirmedMint(open, "0", "0x2");
  assert.equal(done.status, "done");
  assert.equal(done.tokenId, "0");
  assert.equal(done.mintTx, "0x2");
  assert.equal(done.mintAttempted, false);
  assert.equal(isResumable(done), false);
  assert.deepEqual(planResume(done), ["show_result"]);
  const kept = applyConfirmedMint({ ...open, mintTx: "0x2" }, "0");
  assert.equal(kept.mintTx, "0x2");
});

test("resumable means a transaction or collection exists", () => {
  assert.equal(isResumable(null), false);
  assert.equal(isResumable(base()), false);
  assert.equal(isResumable({ ...base(), createTx: "0x1" }), true);
  assert.equal(isResumable({ ...base(), mintAttempted: true }), true);
  assert.equal(isResumable({ ...base(), status: "done", mintTx: "0x2" }), false);
});

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k), map };
}

test("storage round trip is scoped by address and cleared on demand", () => {
  const storage = memoryStorage();
  const store = createDraftStore(() => storage);
  store.save(base());
  assert.equal(store.load(OWNER)?.name, "Badge");
  assert.equal(store.load("0x2222222222222222222222222222222222222222"), null);
  assert.ok([...storage.map.keys()][0].includes(OWNER));
  store.clear(OWNER);
  assert.equal(store.load(OWNER), null);
  assert.equal(storage.map.size, 0);
});

test("invalid or tampered stored drafts are ignored", () => {
  const storage = memoryStorage();
  const store = createDraftStore(() => storage);
  store.save(base());
  const key = [...storage.map.keys()][0];
  storage.map.set(key, JSON.stringify({ ...base(), tokenUri: "data:application/json,{}" }));
  assert.equal(createDraftStore(() => storage).load(OWNER), null);
  storage.map.set(key, "{not json");
  assert.equal(createDraftStore(() => storage).load(OWNER), null);
});

test("storage failure falls back to memory", () => {
  const broken = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
    removeItem() {
      throw new Error("denied");
    },
  };
  const store = createDraftStore(() => broken);
  store.save({ ...base(), mintTx: "0x2" });
  assert.equal(store.load(OWNER)?.mintTx, "0x2");
  store.clear(OWNER);
  assert.equal(store.load(OWNER), null);
  const none = createDraftStore(() => null);
  none.save(base());
  assert.equal(none.load(OWNER)?.name, "Badge");
});
