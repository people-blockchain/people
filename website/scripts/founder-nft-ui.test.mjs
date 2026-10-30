import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeFunctionData, encodeFunctionData, getAddress } from "viem";
import { founderNftCopy, fillFounderNftTemplate } from "../src/lib/founder-nft-content.ts";
import { founderNftListedTokenIds, listFounderNftRows } from "../src/lib/evm/founder-nft-rows.ts";
import { founderNftAbi } from "../src/lib/founders/founder-nft-abi.ts";
import {
  buildFounderNftCancelRequest,
  buildFounderNftExecuteRequest,
  buildFounderNftMintRequest,
  buildFounderNftRequestRebindRequest,
  formatRebindCountdown,
  founderNftApiErrorKey,
  founderNftWriteErrorKey,
  rebindCountdown,
} from "../src/lib/founders/founder-nft-ui.ts";

const config = { address: getAddress("0x0000000000000000000000000000000000000007"), chainId: 97401 };
const personId = `0x${"22".repeat(32)}`;
const holder = getAddress("0x0000000000000000000000000000000000000008");
const next = getAddress("0x0000000000000000000000000000000000000009");
const signature = `0x${"ab".repeat(65)}`;

function decoded(request) {
  const data = encodeFunctionData({ abi: request.abi, functionName: request.functionName, args: request.args });
  return decodeFunctionData({ abi: founderNftAbi, data });
}

test("rebind countdown is ready at executeAfter and never formats a zero minute early", () => {
  const executeAfter = 2 * 86_400 + 5 * 3_600 + 10 * 60;
  const full = rebindCountdown(executeAfter, 0);
  assert.equal(full.ready, false);
  assert.deepEqual({ days: full.days, hours: full.hours, minutes: full.minutes }, { days: 2, hours: 5, minutes: 10 });
  assert.equal(formatRebindCountdown(full), "2d 5h 10m");
  assert.equal(formatRebindCountdown(full, { d: "д", h: "ч", m: "мин" }), "2д 5ч 10мин");

  const almost = rebindCountdown(100, 99);
  assert.equal(almost.ready, false);
  assert.equal(almost.minutes, 0);
  assert.equal(formatRebindCountdown(almost), "1m");

  const ready = rebindCountdown(100, 100);
  assert.equal(ready.ready, true);
  assert.equal(ready.remainingSeconds, 0);
  assert.equal(formatRebindCountdown(ready), "0m");
});

test("wallet and API errors map to copy keys", () => {
  assert.equal(founderNftWriteErrorKey(new Error("user rejected the request")), "errRejected");
  assert.equal(founderNftWriteErrorKey({ shortMessage: "MintWindowClosed()" }), "errMintClosed");
  assert.equal(founderNftWriteErrorKey(new Error("RebindDelayActive")), "errDelayActive");
  assert.equal(founderNftWriteErrorKey(new Error("NotHolder")), "errNotHolder");
  assert.equal(founderNftWriteErrorKey(new Error("something else")), "errGeneric");
  assert.equal(founderNftApiErrorKey(503, "not_configured"), "errNotConfigured");
  assert.equal(founderNftApiErrorKey(403, "hp_required"), "errNotEligible");
  assert.equal(founderNftApiErrorKey(409, "identity_conflict"), "errConflict");
  assert.equal(founderNftApiErrorKey(502, "chain_unavailable"), "errUnavailable");
  assert.equal(founderNftApiErrorKey(400, "invalid_action"), "errGeneric");
});

test("write requests decode to the contract function and arguments", () => {
  const minted = decoded(buildFounderNftMintRequest(config, {
    personId,
    address: holder,
    nonce: "7",
    deadline: "1700000600",
    signature,
  }));
  assert.equal(minted.functionName, "mint");
  assert.deepEqual(minted.args, [personId, holder, 7n, 1_700_000_600n, signature]);

  const rebound = decoded(buildFounderNftRequestRebindRequest(config, {
    personId,
    address: next,
    oldHolder: holder,
    nonce: "8",
    deadline: "1700000700",
    signature,
  }));
  assert.equal(rebound.functionName, "requestRebind");
  assert.deepEqual(rebound.args, [personId, holder, next, 8n, 1_700_000_700n, signature]);

  const cancelled = decoded(buildFounderNftCancelRequest(config, personId));
  assert.equal(cancelled.functionName, "cancelRebind");
  assert.deepEqual(cancelled.args, [personId]);

  const executed = decoded(buildFounderNftExecuteRequest(config, personId));
  assert.equal(executed.functionName, "executeRebind");
  assert.deepEqual(executed.args, [personId]);
});

test("requestRebind builder refuses a signature without the old holder", () => {
  assert.throws(
    () => buildFounderNftRequestRebindRequest(config, { personId, address: next, nonce: "1", deadline: "2", signature }),
    /oldHolder/,
  );
});

test("copy template and locale keys", () => {
  assert.equal(fillFounderNftTemplate("NFT {{n}} at {{holder}}", { n: "#4", holder: "0xabc" }), "NFT #4 at 0xabc");
  assert.equal(fillFounderNftTemplate("{{missing}}", {}), "");
  const enKeys = Object.keys(founderNftCopy.en).sort();
  for (const [lang, copy] of Object.entries(founderNftCopy)) {
    assert.deepEqual(Object.keys(copy).sort(), enKeys, lang);
    if (lang !== "en") assert.notEqual(copy.mintButton, founderNftCopy.en.mintButton, lang);
    assert.match(copy.yourNft, /\{\{n\}\}/, lang);
    assert.match(copy.rebindLead, /\{\{holder\}\}/, lang);
  }
});

test("explorer lists ids 1..min(supply, 50) and skips the chain when unconfigured", async () => {
  assert.deepEqual(founderNftListedTokenIds(0n), []);
  assert.deepEqual(founderNftListedTokenIds(3n), [1n, 2n, 3n]);
  assert.equal(founderNftListedTokenIds(80n).length, 50);
  assert.equal(founderNftListedTokenIds(80n)[49], 50n);

  const previous = process.env.NEXT_PUBLIC_FOUNDER_NFT_ADDRESS;
  delete process.env.NEXT_PUBLIC_FOUNDER_NFT_ADDRESS;
  try {
    assert.deepEqual(await listFounderNftRows(holder), []);
    assert.deepEqual(await listFounderNftRows(), []);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_FOUNDER_NFT_ADDRESS;
    else process.env.NEXT_PUBLIC_FOUNDER_NFT_ADDRESS = previous;
  }
});
