import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseNftParams, ipfsUriToAppPath, ipfsUriToPublicGateway, metadataFetchUrls, isAllowedGatewayRedirect,
  normalizeNftMetadata, nftDisplayName, readCappedText, fetchNftMetadata, isRevertLike,
} from "../src/lib/nft-explorer.ts";

const COLLECTION = "0xEaD74eDB323Da357b1Ea37180Bb48bf1f7b4d582";
const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const CID0 = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";

test("params: collection must be an address and id a canonical decimal uint256", () => {
  assert.deepEqual(parseNftParams(COLLECTION, "0"), { collection: COLLECTION, tokenId: "0" });
  assert.equal(parseNftParams(COLLECTION.toLowerCase(), "42")?.collection, COLLECTION);
  for (const id of ["", "01", "-1", "1.5", "0x10", "abc", " 1", "1 ", "9".repeat(80), (BigInt(2) ** BigInt(256)).toString()]) {
    assert.equal(parseNftParams(COLLECTION, id), null, id);
  }
  for (const col of ["", "0x123", "people1abc", "ppl", COLLECTION + "00", "../etc"]) assert.equal(parseNftParams(col, "1"), null, col);
  assert.ok(parseNftParams(COLLECTION, (BigInt(2) ** BigInt(256) - BigInt(1)).toString()));
});

test("ipfs:// maps to the app proxy and to a public gateway link; other schemes do not", () => {
  assert.equal(ipfsUriToAppPath(`ipfs://${CID}/image.png`), `/api/ipfs/${CID}/image.png`);
  assert.equal(ipfsUriToAppPath(`ipfs://${CID0}`), `/api/ipfs/${CID0}`);
  assert.equal(ipfsUriToPublicGateway(`ipfs://${CID}/metadata.json`), `https://ipfs.io/ipfs/${CID}/metadata.json`);
  assert.equal(ipfsUriToPublicGateway(`ipfs://${CID0}`), `https://ipfs.io/ipfs/${CID0}`);
  for (const bad of ["https://example.com/a.png", "http://example.com", "data:image/svg+xml;base64,AAAA", "javascript:alert(1)", "//evil.test/x", `ipfs://${CID}/../x`, `ipfs://${CID}/a?b=1`, "ipfs://notacid/x", `ipfs://${CID}/a%2f..%2fb`, ""]) {
    assert.equal(ipfsUriToAppPath(bad), null, bad);
    assert.equal(ipfsUriToPublicGateway(bad), null, bad);
  }
});

test("metadata normalisation: name, description, ipfs image via app proxy only", () => {
  const m = normalizeNftMetadata({ name: " Cool ‮ Cat ", description: "d", image: `ipfs://${CID}/image.png`, animation_url: `ipfs://${CID}/clip.mp4` });
  assert.deepEqual(m, { name: "Cool  Cat", description: "d", imageUri: `ipfs://${CID}/image.png`, imageUrl: `/api/ipfs/${CID}/image.png`, animationUrl: `/api/ipfs/${CID}/clip.mp4` });
  const http = normalizeNftMetadata({ name: "x", image: "https://evil.test/a.svg" });
  assert.equal(http.imageUrl, null);
  assert.equal(http.imageUri, "https://evil.test/a.svg");
  assert.equal(normalizeNftMetadata({ image: "data:image/svg+xml,<svg onload=alert(1)>" }).imageUrl, null);
  for (const junk of [null, undefined, "str", 5, [], { name: 5, image: {} }]) {
    assert.deepEqual(normalizeNftMetadata(junk), { name: null, description: null, imageUri: null, imageUrl: null, animationUrl: null });
  }
  assert.equal(normalizeNftMetadata({ name: "n".repeat(500) }).name.length, 120);
});

test("display name falls back to collection name + id, then bare id", () => {
  assert.equal(nftDisplayName("Mine", "Coll", "3"), "Mine");
  assert.equal(nftDisplayName(null, "Coll", "3"), "Coll #3");
  assert.equal(nftDisplayName(null, null, "3"), "#3");
});

test("no SSRF: only ipfs:// URIs produce fetch URLs, only https gateways are allowed", () => {
  assert.deepEqual(metadataFetchUrls(`ipfs://${CID}/metadata.json`, "https://gw.example.org/ipfs/"), [
    `https://gw.example.org/ipfs/${CID}/metadata.json`,
    `https://ipfs.io/ipfs/${CID}/metadata.json`,
  ]);
  assert.deepEqual(metadataFetchUrls(`ipfs://${CID}`, "http://insecure.example/ipfs"), [`https://ipfs.io/ipfs/${CID}`]);
  for (const uri of ["http://127.0.0.1:8080/x", "https://example.com/m.json", "http://169.254.169.254/latest", "file:///etc/passwd", "data:application/json,{}", `ipfs://${CID}/..%2f..`]) {
    assert.deepEqual(metadataFetchUrls(uri, "https://gw.example.org/ipfs"), [], uri);
  }
  const bases = ["https://gw.example.org/ipfs", "https://ipfs.io/ipfs"];
  assert.equal(isAllowedGatewayRedirect(`https://${CID}.ipfs.dweb.link/m.json`, bases), true);
  assert.equal(isAllowedGatewayRedirect("https://sub.ipfs.io/x", bases), true);
  for (const target of ["http://ipfs.io/x", "https://evil.test/x", "https://ipfs.io.evil.test/x", "https://127.0.0.1/x", "https://user:pw@ipfs.io/x", "https://ipfs.io:8443/x", "ftp://ipfs.io/x", "not a url"]) {
    assert.equal(isAllowedGatewayRedirect(target, bases), false, target);
  }
});

test("fetchNftMetadata never calls the network for http(s) URIs and respects the size cap and redirects", async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return new Response(JSON.stringify({ name: "ok" }), { status: 200 }); };
  assert.equal(await fetchNftMetadata("https://example.com/m.json", { fetchImpl }), null);
  assert.equal(await fetchNftMetadata("http://169.254.169.254/", { fetchImpl }), null);
  assert.equal(calls.length, 0);

  assert.deepEqual(await fetchNftMetadata(`ipfs://${CID}/metadata.json`, { fetchImpl }), { name: "ok" });
  assert.equal(calls[0], `https://ipfs.io/ipfs/${CID}/metadata.json`);

  const huge = async () => new Response("x".repeat(2000), { status: 200 });
  assert.equal(await fetchNftMetadata(`ipfs://${CID}/m.json`, { fetchImpl: huge, maxBytes: 100 }), null);
  const notJson = async () => new Response("<html>", { status: 200 });
  assert.equal(await fetchNftMetadata(`ipfs://${CID}/m.json`, { fetchImpl: notJson }), null);

  const seen = [];
  const evilRedirect = async (url) => { seen.push(url); return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }); };
  assert.equal(await fetchNftMetadata(`ipfs://${CID}/m.json`, { fetchImpl: evilRedirect }), null);
  assert.ok(seen.every(url => url.startsWith("https://ipfs.io/")));
  const okRedirect = async (url) => url.startsWith("https://ipfs.io/")
    ? new Response(null, { status: 301, headers: { location: `https://${CID}.ipfs.dweb.link/m.json` } })
    : new Response(JSON.stringify({ name: "redirected" }), { status: 200 });
  assert.deepEqual(await fetchNftMetadata(`ipfs://${CID}/m.json`, { fetchImpl: okRedirect }), { name: "redirected" });
  const boom = async () => { throw new Error("network down"); };
  assert.equal(await fetchNftMetadata(`ipfs://${CID}/m.json`, { fetchImpl: boom }), null);
});

test("readCappedText cuts streams that exceed the cap even without content-length", async () => {
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(60)); c.enqueue(new Uint8Array(60)); c.close(); } });
  assert.equal(await readCappedText(new Response(stream), 100), null);
  assert.equal(await readCappedText(new Response("hello"), 100), "hello");
});

test("revert-like errors are told apart from transport failures", () => {
  assert.equal(isRevertLike({ name: "ContractFunctionExecutionError", cause: { name: "ContractFunctionRevertedError" } }), true);
  assert.equal(isRevertLike({ message: 'The contract function "ownerOf" returned no data ("0x")' }), true);
  assert.equal(isRevertLike(new Error("execution reverted: ERC721NonexistentToken")), true);
  assert.equal(isRevertLike(new Error("fetch failed")), false);
  assert.equal(isRevertLike({ name: "TimeoutError", message: "timeout" }), false);
  assert.equal(isRevertLike(null), false);
});

test("UI never renders untrusted markup: NftView has no dangerouslySetInnerHTML and shows images only from metadata.imageUrl", () => {
  const view = readFileSync(new URL("../src/components/explorer/NftView.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(view, /dangerouslySetInnerHTML|<iframe|<object|<embed/);
  assert.match(view, /<img src=\{meta\.imageUrl\}/);
  const mint = readFileSync(new URL("../src/components/factory/EvmNftMint.tsx", import.meta.url), "utf8");
  assert.match(mint, /href=\{`\/explorer\/nft\/\$\{result\.collection\}\/\$\{result\.tokenId\.toString\(\)\}`\}/);
});
