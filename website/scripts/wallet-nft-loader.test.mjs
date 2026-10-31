import test from "node:test";
import assert from "node:assert/strict";
import {
  NFT_CLIENT_TIMEOUT_MS,
  NFT_PAGE_ATTEMPTS,
  applyNftPage,
  initialNftLoadState,
  loadOwnerNfts,
  nftLoadFailed,
  nftPageRetryDelayMs,
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
    maxAttempts: 1,
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

test("page retries use the same cursor and exponential backoff", () => {
  assert.equal(NFT_PAGE_ATTEMPTS, 4);
  assert.deepEqual([1, 2, 3, 4].map((attempt) => nftPageRetryDelayMs(attempt)), [400, 800, 1600, 3200]);
});

test("a page error retries the same cursor, then keeps loaded NFTs", async () => {
  const delays = [];
  const cursors = [];
  let hits = 0;
  const loaded = await loadOwnerNfts(owner, {
    timeoutMs: 200,
    maxAttempts: 4,
    retryDelayMs: (attempt) => {
      delays.push(attempt);
      return 0;
    },
    fetchImpl: async (path) => {
      const cursor = new URL("http://localhost/nfts?" + path.split("?")[1]).searchParams.get("cursor");
      cursors.push(cursor);
      if (cursor === "10-20") {
        hits += 1;
        if (hits < 3) throw new Error("page_down");
        return new Response(JSON.stringify({ items: [{ nftId: "b", name: "B" }], partial: false }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ items: [{ nftId: "a", name: "A" }], partial: true, next: "10-20" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  assert.deepEqual(delays, [1, 2]);
  assert.equal(cursors.filter((cursor) => cursor === "10-20").length, 3);
  assert.equal(loaded.phase, "ready");
  assert.deepEqual(loaded.items.map((item) => item.nftId), ["a", "b"]);
});

test("one page failing does not drop NFTs already loaded, and retry resumes that cursor", async () => {
  const seen = [];
  const failed = await loadOwnerNfts(owner, {
    timeoutMs: 200,
    maxAttempts: 3,
    retryDelayMs: () => 0,
    onState: (state) => seen.push({ phase: state.phase, ids: state.items.map((item) => item.nftId), next: state.next }),
    fetchImpl: async (path) => {
      if (path.includes("cursor=")) throw new Error("page_down");
      return new Response(JSON.stringify([{ nftId: "a", name: "A" }]), {
        status: 200,
        headers: { "content-type": "application/json", "x-nfts-partial": "1", "x-nfts-next": "10-20" },
      });
    },
  });
  assert.equal(failed.phase, "error");
  assert.deepEqual(failed.items.map((item) => item.nftId), ["a"]);
  assert.equal(failed.next, "10-20");
  assert.ok(seen.some((state) => state.phase === "ready" && state.ids.includes("a")));
  assert.ok(seen.every((state) => state.ids.length === 0 || state.ids.includes("a")));

  const paths = [];
  const resumed = await loadOwnerNfts(owner, {
    timeoutMs: 200,
    maxAttempts: 1,
    resume: { items: failed.items, next: failed.next },
    fetchImpl: async (path) => {
      paths.push(path);
      return new Response(JSON.stringify({ items: [{ nftId: "b", name: "B" }], partial: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assert.match(paths[0], /cursor=10-20/);
  assert.equal(resumed.phase, "ready");
  assert.deepEqual(resumed.items.map((item) => item.nftId), ["a", "b"]);
});

test("history loading has no single timeout across pages", async () => {
  const timeoutMs = 40;
  let calls = 0;
  const started = Date.now();
  const loaded = await loadOwnerNfts(owner, {
    timeoutMs,
    maxAttempts: 1,
    fetchImpl: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
      const last = calls >= 5;
      return new Response(JSON.stringify([{ nftId: `n${calls}`, name: `N${calls}` }]), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-nfts-partial": last ? "0" : "1",
          ...(last ? {} : { "x-nfts-next": `c${calls}` }),
        },
      });
    },
  });
  assert.equal(loaded.phase, "ready");
  assert.equal(loaded.historyLoading, false);
  assert.equal(loaded.items.length, 5);
  assert.ok(Date.now() - started > timeoutMs, "pages are not cut by one shared timer");
});
