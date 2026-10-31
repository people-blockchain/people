// /api/ipfs/<cid>: a bare-CID image (no file extension) served by the gateway with a generic or
// missing Content-Type is typed from its magic bytes, so WebP/PNG/GIF NFTs render instead of
// a grey placeholder. Active content (html/svg) is still refused. No network: fake fetchImpl only.
import assert from "node:assert/strict";
import test from "node:test";
import { fetchIpfsFromGateways, sniffIpfsContentType } from "@/lib/ipfs";

const CID = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
const bytes = (...parts) => new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? Array.from(p, (c) => c.charCodeAt(0)) : p)));

const WEBP = bytes("RIFF", [0x24, 0, 0, 0], "WEBPVP8 ", [1, 2, 3, 4]);
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 13]);
const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const GIF = bytes("GIF89a", [1, 0, 1, 0, 0x80, 0, 0, 0, 0]);
const MP4 = bytes([0, 0, 0, 0x18], "ftypisom", [0, 0, 2, 0]);
const MOV = bytes([0, 0, 0, 0x14], "ftypqt  ", [0, 0, 2, 0]);
const WEBM = bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f]);

test("sniffIpfsContentType recognizes the allowlisted media by magic bytes", () => {
  assert.equal(sniffIpfsContentType(WEBP), "image/webp");
  assert.equal(sniffIpfsContentType(PNG), "image/png");
  assert.equal(sniffIpfsContentType(JPEG), "image/jpeg");
  assert.equal(sniffIpfsContentType(GIF), "image/gif");
  assert.equal(sniffIpfsContentType(MP4), "video/mp4");
  assert.equal(sniffIpfsContentType(MOV), "video/quicktime");
  assert.equal(sniffIpfsContentType(WEBM), "video/webm");
});

test("sniffIpfsContentType refuses html, svg, short and unknown bytes", () => {
  for (const b of [bytes("<html><script>x</script>"), bytes("<svg xmlns='x'/>"), bytes("RIFF"), bytes("RIFF", [0, 0, 0, 0], "WAVE"), new Uint8Array()]) {
    assert.equal(sniffIpfsContentType(b), null);
  }
});

test("bare-CID WebP with a generic or missing upstream type is served as image/webp", async () => {
  for (const upstream of ["application/octet-stream", "text/plain; charset=utf-8", null]) {
    const fetchImpl = async () => new Response(WEBP, { status: 200, headers: upstream ? { "content-type": upstream } : {} });
    const r = await fetchIpfsFromGateways(CID, "", { fetchImpl });
    assert.equal(r.ok, true, String(upstream));
    assert.equal(r.contentType, "image/webp");
    assert.deepEqual(Array.from(r.body), Array.from(WEBP));
  }
});

test("bare-CID GIF and PNG are typed from bytes as well", async () => {
  for (const [body, expected] of [[GIF, "image/gif"], [PNG, "image/png"]]) {
    const fetchImpl = async () => new Response(body, { status: 200, headers: { "content-type": "application/octet-stream" } });
    const r = await fetchIpfsFromGateways(CID, "", { fetchImpl });
    assert.equal(r.contentType, expected);
  }
});

test("explicit html/svg upstream types are refused without sniffing, even with image bytes", async () => {
  for (const type of ["text/html", "image/svg+xml"]) {
    const fetchImpl = async () => new Response(PNG, { status: 200, headers: { "content-type": type } });
    const r = await fetchIpfsFromGateways(CID, "", { fetchImpl });
    assert.deepEqual([r.ok, r.status], [false, 415], type);
  }
});

test("generic upstream type with html bytes stays 415 (fatal, no other gateway tried)", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response("<html>listing</html>", { status: 200, headers: { "content-type": "application/octet-stream" } });
  };
  const r = await fetchIpfsFromGateways(CID, "", { fetchImpl });
  assert.deepEqual([r.ok, r.status], [false, 415]);
  assert.equal(calls, 1);
});
