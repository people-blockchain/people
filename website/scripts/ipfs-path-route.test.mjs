// Tests for /api/ipfs/[...path]: strict path parsing, allowlisted gateway URLs, fallback,
// content-type inference, size cap and redirect handling. No network: fake fetchImpl only.
import assert from "node:assert/strict";
import test from "node:test";
import {
  IPFS_GATEWAY_HOST_ALLOWLIST,
  fetchIpfsFromGateways,
  ipfsGatewayCandidates,
  parseIpfsRequestPath,
} from "@/lib/ipfs";

const CID = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

function withGatewayEnv(value, fn) {
  const prev = process.env.IPFS_GATEWAY_URL;
  if (value === undefined) delete process.env.IPFS_GATEWAY_URL;
  else process.env.IPFS_GATEWAY_URL = value;
  const restore = () => {
    if (prev === undefined) delete process.env.IPFS_GATEWAY_URL;
    else process.env.IPFS_GATEWAY_URL = prev;
  };
  try {
    const out = fn();
    if (out && typeof out.then === "function") return out.finally(restore);
    restore();
    return out;
  } catch (e) {
    restore();
    throw e;
  }
}

function resp(body, init = {}) {
  return new Response(body, init);
}

function streamOf(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
}

const ok = (body = PNG, type = "image/png") => resp(body, { status: 200, headers: { "content-type": type } });

test("parse accepts bare cid and nested paths", () => {
  assert.deepEqual(parseIpfsRequestPath([CID]), { cid: CID, subPath: "" });
  assert.deepEqual(parseIpfsRequestPath([CID, "image.png"]), { cid: CID, subPath: "image.png" });
  assert.deepEqual(parseIpfsRequestPath([CID, "a", "b.png"]), { cid: CID, subPath: "a/b.png" });
});

test("parse rejects traversal, encoded separators, odd chars and bad cids", () => {
  const bad = [
    [],
    ["not-a-cid"],
    [CID, ".."],
    [CID, "."],
    [CID, "a", ".."],
    [CID, "%2e%2e"],
    [CID, "%2E%2E"],
    [CID, "a%2fb"],
    [CID, "%252e"],
    [CID, "a\\b.png"],
    [CID, "a/b.png"],
    [CID, ""],
    [CID, "a", "", "b"],
    [CID, "a\0b.png"],
    [CID, "a\nb.png"],
    [CID, "a:b"],
    [CID, "a?b"],
    [CID, "a#b"],
    [CID, "@evil.com"],
    [CID, "evil.com:80"],
    [CID, "x".repeat(129)],
    [CID, ...Array.from({ length: 9 }, () => "a")],
    [CID, ...Array.from({ length: 5 }, () => "y".repeat(120))],
    [` ${CID}`],
  ];
  for (const segs of bad) {
    assert.equal(parseIpfsRequestPath(segs), null, JSON.stringify(segs));
  }
});

test("parse allows depth 8", () => {
  const segs = Array.from({ length: 8 }, (_, i) => `d${i}`);
  assert.deepEqual(parseIpfsRequestPath([CID, ...segs]), { cid: CID, subPath: segs.join("/") });
});

test("gateway candidates only use allowlisted https hosts", () => {
  withGatewayEnv(undefined, () => {
    const urls = ipfsGatewayCandidates(CID, "a/image.png");
    assert.ok(urls.length >= IPFS_GATEWAY_HOST_ALLOWLIST.length);
    for (const u of urls) {
      const url = new URL(u);
      assert.equal(url.protocol, "https:");
      assert.ok(IPFS_GATEWAY_HOST_ALLOWLIST.includes(url.hostname));
      assert.ok(u.endsWith(`/${CID}/a/image.png`));
    }
    assert.equal(urls[0], `https://gateway.pinata.cloud/ipfs/${CID}/a/image.png`);
    assert.equal(ipfsGatewayCandidates(CID, "")[0], `https://gateway.pinata.cloud/ipfs/${CID}`);
  });
});

test("user-provided host-like subpaths never change the host", () => {
  withGatewayEnv(undefined, () => {
    for (const sub of ["@evil.com", "//evil.com", "evil.com:80", "..", "a/../../x", "%2f%2fevil.com", "a\\b"]) {
      const urls = ipfsGatewayCandidates(CID, sub);
      for (const u of urls) {
        assert.ok(IPFS_GATEWAY_HOST_ALLOWLIST.includes(new URL(u).hostname), `${sub} -> ${u}`);
      }
    }
    assert.deepEqual(ipfsGatewayCandidates("not-a-cid", "x.png"), []);
  });
});

test("configured gateway: allowlisted https host is used first, others are ignored", () => {
  withGatewayEnv("https://ipfs.io/ipfs/", () => {
    assert.equal(ipfsGatewayCandidates(CID, "")[0], `https://ipfs.io/ipfs/${CID}`);
  });
  for (const bad of [
    "https://evil.example/ipfs",
    "http://ipfs.io/ipfs",
    "https://ipfs.io.evil.example/ipfs",
    "https://user:pw@ipfs.io/ipfs",
    "https://ipfs.io:8443/ipfs",
    "not a url",
  ]) {
    withGatewayEnv(bad, () => {
      const urls = ipfsGatewayCandidates(CID, "image.png");
      assert.ok(urls.length > 0);
      for (const u of urls) {
        assert.ok(IPFS_GATEWAY_HOST_ALLOWLIST.includes(new URL(u).hostname), `${bad} -> ${u}`);
      }
      assert.equal(urls[0], `https://gateway.pinata.cloud/ipfs/${CID}/image.png`);
    });
  }
});

test("fallback: first gateway 502 then second serves png", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return calls.length === 1 ? resp("bad gateway", { status: 502 }) : ok();
  };
  const r = await withGatewayEnv(undefined, () => fetchIpfsFromGateways(CID, "image.png", { fetchImpl }));
  assert.equal(r.ok, true);
  assert.equal(r.contentType, "image/png");
  assert.deepEqual([...r.body], [...PNG]);
  assert.equal(calls.length, 2);
  assert.notEqual(new URL(calls[0]).hostname, new URL(calls[1]).hostname);
});

test("fallback: timeout on first gateway (fetch ignores abort) then second serves", async () => {
  let n = 0;
  const fetchImpl = async () => {
    n += 1;
    if (n === 1) return new Promise(() => {});
    return ok();
  };
  const r = await fetchIpfsFromGateways(CID, "image.png", { fetchImpl, timeoutMs: 20 });
  assert.equal(r.ok, true);
  assert.equal(n, 2);
});

test("fallback on network error and 404 from earlier gateways", async () => {
  let n = 0;
  const fetchImpl = async () => {
    n += 1;
    if (n === 1) throw new TypeError("fetch failed");
    if (n === 2) return resp("nf", { status: 404 });
    return ok();
  };
  const r = await fetchIpfsFromGateways(CID, "image.png", { fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(n, 3);
});

test("content type is inferred from extension when upstream is generic", async () => {
  const cases = [
    ["application/octet-stream", "image.png", "image/png"],
    ["text/plain", "a/b.JPG", "image/jpeg"],
    [null, "x.webp", "image/webp"],
    ["application/octet-stream", "x.gif", "image/gif"],
    ["application/octet-stream", "x.mp4", "video/mp4"],
    ["application/octet-stream", "x.webm", "video/webm"],
    ["text/plain; charset=utf-8", "meta.json", "application/json"],
  ];
  for (const [upstream, sub, expected] of cases) {
    const fetchImpl = async () =>
      resp(PNG, { status: 200, headers: upstream ? { "content-type": upstream } : {} });
    const r = await fetchIpfsFromGateways(CID, sub, { fetchImpl });
    assert.equal(r.ok, true, sub);
    assert.equal(r.contentType, expected, sub);
  }
});

test("generic upstream type without a known extension and unrecognized bytes is rejected with 415", async () => {
  for (const sub of ["", "file", "file.bin", "x.html", "x.svg"]) {
    const fetchImpl = async () => ok(PNG, "application/octet-stream");
    const r = await fetchIpfsFromGateways(CID, sub, { fetchImpl });
    assert.deepEqual([r.ok, r.status], [false, 415], sub);
  }
});

test("html and svg upstream are never served, even with a png extension", async () => {
  for (const type of ["text/html", "text/html; charset=utf-8", "image/svg+xml"]) {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return ok("<html>listing</html>", type);
    };
    const r = await fetchIpfsFromGateways(CID, "image.png", { fetchImpl });
    assert.deepEqual([r.ok, r.status], [false, 415], type);
    assert.equal(calls, 1);
  }
  const dir = await fetchIpfsFromGateways(CID, "", { fetchImpl: async () => ok("<html></html>", "text/html") });
  assert.deepEqual([dir.ok, dir.status], [false, 415]);
});

test("size cap: content-length too large -> 413", async () => {
  const fetchImpl = async () =>
    resp(PNG, { status: 200, headers: { "content-type": "image/png", "content-length": "5000" } });
  const r = await fetchIpfsFromGateways(CID, "image.png", { fetchImpl, maxBytes: 1000 });
  assert.deepEqual([r.ok, r.status], [false, 413]);
});

test("size cap: streaming overflow without content-length -> 413 and stream is cancelled", async () => {
  let cancelled = false;
  const fetchImpl = async () => {
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(400));
      },
      cancel() {
        cancelled = true;
      },
    });
    return new Response(stream, { status: 200, headers: { "content-type": "image/png" } });
  };
  const r = await fetchIpfsFromGateways(CID, "image.png", { fetchImpl, maxBytes: 1000 });
  assert.deepEqual([r.ok, r.status], [false, 413]);
  assert.equal(cancelled, true);
});

test("body exactly at the cap is served, chunks are concatenated", async () => {
  const fetchImpl = async () =>
    new Response(streamOf([new Uint8Array(500).fill(1), new Uint8Array(500).fill(2)]), {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  const r = await fetchIpfsFromGateways(CID, "image.png", { fetchImpl, maxBytes: 1000 });
  assert.equal(r.ok, true);
  assert.equal(r.body.byteLength, 1000);
  assert.equal(r.body[0], 1);
  assert.equal(r.body[999], 2);
});

test("all gateways 404 -> 404; mixed failures -> 502", async () => {
  const all404 = await fetchIpfsFromGateways(CID, "image.png", {
    fetchImpl: async () => resp("nope", { status: 404 }),
  });
  assert.deepEqual([all404.ok, all404.status], [false, 404]);

  let n = 0;
  const mixed = await fetchIpfsFromGateways(CID, "image.png", {
    fetchImpl: async () => (++n === 1 ? resp("x", { status: 502 }) : resp("nope", { status: 404 })),
  });
  assert.deepEqual([mixed.ok, mixed.status], [false, 502]);

  const allDown = await fetchIpfsFromGateways(CID, "", {
    fetchImpl: async () => {
      throw new TypeError("fetch failed");
    },
  });
  assert.deepEqual([allDown.ok, allDown.status], [false, 502]);
});

test("redirect to a non-allowlisted host is not followed", async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(String(url));
    return resp(null, { status: 302, headers: { location: "https://evil.example/steal.png" } });
  };
  const r = await fetchIpfsFromGateways(CID, "image.png", { fetchImpl });
  assert.deepEqual([r.ok, r.status], [false, 502]);
  for (const u of seen) assert.ok(IPFS_GATEWAY_HOST_ALLOWLIST.includes(new URL(u).hostname), u);
});

test("redirect to http, userinfo or protocol-relative evil hosts is not followed", async () => {
  for (const location of ["http://ipfs.io/ipfs/x", "https://a@evil.example/x", "//evil.example/x", ""]) {
    const seen = [];
    const fetchImpl = async (url) => {
      seen.push(String(url));
      return resp(null, { status: 301, headers: location ? { location } : {} });
    };
    await fetchIpfsFromGateways(CID, "image.png", { fetchImpl });
    for (const u of seen) assert.ok(IPFS_GATEWAY_HOST_ALLOWLIST.includes(new URL(u).hostname), `${location} -> ${u}`);
  }
});

test("one redirect to an allowlisted host is followed, a second redirect is not", async () => {
  const target = `https://dweb.link/ipfs/${CID}/image.png`;
  const seen = [];
  const followed = await fetchIpfsFromGateways(CID, "image.png", {
    fetchImpl: async (url, init) => {
      seen.push(String(url));
      assert.equal(init.redirect, "manual");
      return String(url) === target ? ok() : resp(null, { status: 301, headers: { location: target } });
    },
  });
  assert.equal(followed.ok, true);
  assert.ok(seen.includes(target));

  let hops = 0;
  const chained = await fetchIpfsFromGateways(CID, "image.png", {
    fetchImpl: async () => {
      hops += 1;
      return resp(null, { status: 301, headers: { location: target } });
    },
  });
  assert.equal(chained.ok, false);
  assert.ok(hops <= 2 * IPFS_GATEWAY_HOST_ALLOWLIST.length + 2);
});

test("upstream URLs requested by the fetcher are all allowlisted", async () => {
  const seen = [];
  await withGatewayEnv("https://evil.example/ipfs", () =>
    fetchIpfsFromGateways(CID, "image.png", {
      fetchImpl: async (url) => {
        seen.push(String(url));
        return resp("x", { status: 502 });
      },
    }),
  );
  assert.ok(seen.length >= 1);
  for (const u of seen) assert.ok(IPFS_GATEWAY_HOST_ALLOWLIST.includes(new URL(u).hostname), u);
});
