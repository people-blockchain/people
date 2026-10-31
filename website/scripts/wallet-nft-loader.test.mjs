import test from "node:test";
import assert from "node:assert/strict";
import {
  NFT_CLIENT_TIMEOUT_MS,
  applyNftPage,
  initialNftLoadState,
  loadOwnerNfts,
  nftLoadFailed,
} from "../src/lib/wallet-nft-loader.ts";

const owner = "0x1003A5Ae6ccd73818fB33718e341a73BA77a80c2";

test("timeout or thrown fetch ends in error, not loading", async () => {
  assert.equal(NFT_CLIENT_TIMEOUT_MS, 12_000);
  const started = initialNftLoadState();
  assert.equal(started.phase, "loading");
  const failed = nftLoadFailed(started);
  assert.equal(failed.phase, "error");
  assert.equal(failed.historyLoading, false);

  let sawSignal = false;
  const timedOut = await loadOwnerNfts(owner, {
    timeoutMs: 40,
    fetchImpl: (_path, init) =>
      new Promise((_resolve, reject) => {
        sawSignal = Boolean(init?.signal);
        init.signal.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      }),
  });
  assert.equal(sawSignal, true);
  assert.equal(timedOut.phase, "error");
  assert.notEqual(timedOut.phase, "loading");
  assert.equal(timedOut.historyLoading, false);
});

test("partial pages are shown immediately and followed until complete", async () => {
  let state = applyNftPage(initialNftLoadState(), {
    items: [{ nftId: "a", name: "A" }],
    partial: true,
    next: "10-20",
  });
  assert.deepEqual(state.items.map((item) => item.nftId), ["a"]);
  assert.equal(state.phase, "ready");
  assert.equal(state.historyLoading, true);
  assert.equal(state.next, "10-20");
  state = applyNftPage(state, { items: [{ nftId: "a", name: "A" }, { nftId: "b", name: "B" }], partial: false });
  assert.deepEqual(state.items.map((item) => item.nftId), ["a", "b"]);
  assert.equal(state.historyLoading, false);
  assert.equal(state.partial, false);
  assert.equal(state.next, undefined);

  const paths = [];
  const loaded = await loadOwnerNfts(owner, {
    timeoutMs: 1_000,
    fetchImpl: async (path) => {
      paths.push(path);
      const first = paths.length === 1;
      const items = first
        ? [{ nftId: "a", name: "A" }]
        : [{ nftId: "b", name: "B" }];
      return new Response(JSON.stringify(items), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-nfts-partial": first ? "1" : "0",
          ...(first ? { "x-nfts-next": "10-20" } : {}),
        },
      });
    },
  });
  assert.equal(loaded.phase, "ready");
  assert.equal(loaded.historyLoading, false);
  assert.deepEqual(loaded.items.map((item) => item.nftId), ["a", "b"]);
  assert.equal(paths.length, 2);
  assert.match(paths[0], /owner=/);
  assert.match(paths[1], /cursor=10-20/);
});
