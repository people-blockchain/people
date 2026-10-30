import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  NFT_DESCRIPTION_MAX,
  NFT_DIRECT_MEDIA_MAX_BYTES,
  NFT_IMAGE_ACCEPT,
  NFT_IMAGE_MAX_BYTES,
  NFT_METADATA_MAX_BYTES,
  NFT_SVG_MAX_BYTES,
  NFT_VIDEO_MAX_BYTES,
  NftMetadataError,
  buildNftMetadata,
  imageKindFromMime,
  isAllowedMediaUri,
  isBareIpfsUri,
  maxBytesForImage,
  parseIpfsMediaUri,
  sniffNftImage,
  validVideoHeader,
} from "../src/lib/nft-media-rules.ts";
import { checkImageFile, checkVideoFile, effectiveMime, errorKeyForServerCode } from "../src/lib/nft-media-client.ts";

const fixture = (name) => new Uint8Array(readFileSync(new URL(`./fixtures/nft-media/${name}`, import.meta.url)));
const text = (s) => new TextEncoder().encode(s);
const CID_V1 = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const CID_V0 = "QmYwAPJzv5CZsnA625s3Xv2gteR83C12YCZqGbv3bdgqm4";

test("limits match PeopleScan caps", () => {
  assert.equal(NFT_IMAGE_MAX_BYTES, 1_500_000);
  assert.equal(NFT_SVG_MAX_BYTES, 262_144);
  assert.equal(NFT_DIRECT_MEDIA_MAX_BYTES, 25_000_000);
  assert.equal(NFT_VIDEO_MAX_BYTES, 25_000_000);
  assert.equal(NFT_METADATA_MAX_BYTES, 262_144);
  assert.equal(maxBytesForImage("png"), 1_500_000);
  assert.equal(maxBytesForImage("svg"), 262_144);
});

test("image sniffing: PNG, JPEG, WebP and SVG (BOM, XML declaration, comments)", () => {
  assert.equal(sniffNftImage(fixture("image.png")), "png");
  assert.equal(sniffNftImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "jpeg");
  assert.equal(sniffNftImage(text("RIFF\0\0\0\0WEBPVP8 ")), "webp");
  assert.equal(sniffNftImage(fixture("clean.svg")), "svg");
  assert.equal(sniffNftImage(text('﻿<?xml version="1.0"?>\n<!-- made by hand -->\n<svg xmlns="http://www.w3.org/2000/svg"/>')), "svg");
  assert.equal(sniffNftImage(text("  <svg/>")), "svg");
});

test("image sniffing rejects HTML dressed as SVG, text and random bytes", () => {
  assert.equal(sniffNftImage(text("<html><svg/></html>")), null);
  assert.equal(sniffNftImage(text("<script>alert(1)</script><svg/>")), null);
  assert.equal(sniffNftImage(text("<svgfoo/>")), null);
  assert.equal(sniffNftImage(text("hello")), null);
  assert.equal(sniffNftImage(new Uint8Array([1, 2, 3, 4, 5])), null);
  assert.equal(sniffNftImage(new Uint8Array()), null);
  assert.equal(sniffNftImage(text("GIF89a")), null);
});

test("a PNG renamed .svg is a type mismatch, not an SVG", () => {
  assert.equal(sniffNftImage(fixture("image.png")), "png");
  assert.notEqual(sniffNftImage(fixture("image.png")), imageKindFromMime("image/svg+xml"));
  assert.equal(imageKindFromMime("image/svg+xml"), "svg");
  assert.equal(imageKindFromMime("image/gif"), null);
  assert.equal(imageKindFromMime("text/html"), null);
});

test("video header rules match PeopleScan validVideo", () => {
  const mp4 = fixture("video.mp4");
  const webm = fixture("video.webm");
  assert.equal(validVideoHeader(mp4.subarray(0, 4096), "video/mp4", mp4.length), true);
  assert.equal(validVideoHeader(webm.subarray(0, 4096), "video/webm", webm.length), true);
  // Declared type must match the container.
  assert.equal(validVideoHeader(mp4.subarray(0, 4096), "video/webm", mp4.length), false);
  assert.equal(validVideoHeader(webm.subarray(0, 4096), "video/mp4", webm.length), false);
  assert.equal(validVideoHeader(mp4.subarray(0, 4096), "video/quicktime", mp4.length), false);
  // QuickTime brand.
  const qt = mp4.slice(0, 4096);
  qt.set(text("qt  "), 8);
  assert.equal(validVideoHeader(qt, "video/mp4", mp4.length), false);
  // Box size larger than the file, or too small.
  const big = mp4.slice(0, 4096);
  big.set([0x7f, 0xff, 0xff, 0xff], 0);
  assert.equal(validVideoHeader(big, "video/mp4", mp4.length), false);
  const tiny = mp4.slice(0, 4096);
  tiny.set([0, 0, 0, 8], 0);
  assert.equal(validVideoHeader(tiny, "video/mp4", mp4.length), false);
  // WebM without the doctype, and random bytes.
  const noDoc = new Uint8Array(4096);
  noDoc.set([0x1a, 0x45, 0xdf, 0xa3], 0);
  assert.equal(validVideoHeader(noDoc, "video/webm", 5000), false);
  assert.equal(validVideoHeader(new Uint8Array(4096).fill(7), "video/mp4", 5000), false);
  assert.equal(validVideoHeader(new Uint8Array(4096).fill(7), "video/webm", 5000), false);
});

test("video size boundaries: 25 MB passes, one byte over does not", () => {
  const mp4 = fixture("video.mp4").subarray(0, 4096);
  assert.equal(validVideoHeader(mp4, "video/mp4", NFT_VIDEO_MAX_BYTES), true);
  assert.equal(validVideoHeader(mp4, "video/mp4", NFT_VIDEO_MAX_BYTES + 1), false);
  assert.equal(validVideoHeader(mp4, "video/mp4", 0), false);
});

test("client pre-checks: size boundaries and extension fallback for empty types", () => {
  assert.equal(checkImageFile({ name: "a.png", type: "image/png", size: NFT_DIRECT_MEDIA_MAX_BYTES }).ok, true);
  assert.deepEqual(checkImageFile({ name: "a.png", type: "image/png", size: NFT_DIRECT_MEDIA_MAX_BYTES + 1 }), { ok: false, key: "errTooLarge" });
  assert.equal(checkImageFile({ name: "a.webp", type: "image/webp", size: NFT_DIRECT_MEDIA_MAX_BYTES }).ok, true);
  assert.equal(checkImageFile({ name: "a.gif", type: "image/gif", size: NFT_DIRECT_MEDIA_MAX_BYTES }).ok, true);
  assert.equal(checkImageFile({ name: "a.gif", type: "", size: 10 }).ok, true);
  assert.match(NFT_IMAGE_ACCEPT, /image\/gif/);
  assert.match(NFT_IMAGE_ACCEPT, /image\/webp/);
  assert.equal(checkImageFile({ name: "a.svg", type: "image/svg+xml", size: 262_144 }).ok, true);
  assert.deepEqual(checkImageFile({ name: "a.svg", type: "image/svg+xml", size: 262_145 }), { ok: false, key: "errTooLarge" });
  assert.equal(checkVideoFile({ name: "a.mp4", type: "video/mp4", size: NFT_VIDEO_MAX_BYTES }).ok, true);
  assert.deepEqual(checkVideoFile({ name: "a.mp4", type: "video/mp4", size: NFT_VIDEO_MAX_BYTES + 1 }), { ok: false, key: "errTooLarge" });
  assert.equal(effectiveMime({ name: "clip.WEBM", type: "" }), "video/webm");
  assert.equal(checkVideoFile({ name: "clip.mp4", type: "", size: 10 }).ok, true);
  assert.deepEqual(checkVideoFile({ name: "clip.mov", type: "video/quicktime", size: 10 }), { ok: false, key: "errUnsupportedType" });
  assert.equal(checkImageFile({ name: "a.gif", type: "image/gif", size: 10 }).ok, true);
  assert.equal(errorKeyForServerCode("svg_rejected"), "errSvgRejected");
  assert.equal(errorKeyForServerCode("something_new"), "errUnknown");
});

test("media URIs: only ipfs:// and public https://", () => {
  assert.equal(isAllowedMediaUri(`ipfs://${CID_V1}/image.svg`), true);
  assert.equal(isAllowedMediaUri(`ipfs://${CID_V0}`), true);
  assert.equal(isAllowedMediaUri("https://example.org/a.png"), true);
  assert.equal(isAllowedMediaUri("https://example.org:443/a.png"), true);
  for (const bad of [
    "data:image/png;base64,AAAA",
    "blob:https://example.org/uuid",
    "http://example.org/a.png",
    "javascript:alert(1)",
    "file:///etc/passwd",
    `ipfs://${CID_V1}/../x`,
    `ipfs://${CID_V1}/./x`,
    "ipfs://not-a-cid/x",
    "https://user:pw@example.org/a.png",
    "https://example.org:8443/a.png",
    "https://localhost/a.png",
    "https://intranet/a.png",
    "https://[::1]/a.png",
    "",
    42,
  ])
    assert.equal(isAllowedMediaUri(bad), false, String(bad));
  assert.deepEqual(parseIpfsMediaUri(`ipfs://${CID_V1}/metadata.json`), { cid: CID_V1, path: "metadata.json" });
  assert.equal(isBareIpfsUri(`ipfs://${CID_V1}`), true);
  assert.equal(isBareIpfsUri(`ipfs://${CID_V1}/x.mp4`), false);
});

test("metadata JSON: exact keys and order, animation_url only for video", () => {
  const image = `ipfs://${CID_V1}/image.svg`;
  const animation = `ipfs://${CID_V0}`;
  const photo = buildNftMetadata({ name: " Badge ", description: "A demo", image });
  assert.deepEqual(Object.keys(photo), ["name", "description", "image"]);
  assert.equal(photo.name, "Badge");
  const video = buildNftMetadata({ name: "Clip", description: "", image, animationUrl: animation });
  assert.deepEqual(Object.keys(video), ["name", "image", "animation_url"]);
  assert.equal(JSON.stringify(video), JSON.stringify({ name: "Clip", image, animation_url: animation }));
  assert.equal(JSON.stringify(buildNftMetadata({ name: "AB", description: "d", image, animationUrl: animation })), JSON.stringify({ name: "AB", description: "d", image, animation_url: animation }));
});

test("metadata JSON: limits and bad addresses are refused", () => {
  const image = `ipfs://${CID_V1}/image.png`;
  const code = (fn) => {
    try {
      fn();
    } catch (err) {
      assert.ok(err instanceof NftMetadataError);
      return err.code;
    }
    return null;
  };
  assert.equal(code(() => buildNftMetadata({ name: "A", image })), "invalid_name");
  assert.equal(code(() => buildNftMetadata({ name: "x".repeat(201), image })), "invalid_name");
  assert.equal(code(() => buildNftMetadata({ name: "x".repeat(200), image })), null);
  assert.equal(code(() => buildNftMetadata({ name: "Ok", description: "d".repeat(NFT_DESCRIPTION_MAX + 1), image })), "invalid_description");
  assert.equal(code(() => buildNftMetadata({ name: "Ok", description: "d".repeat(NFT_DESCRIPTION_MAX), image })), null);
  assert.equal(code(() => buildNftMetadata({ name: "Ok", image: "blob:https://example.org/x" })), "invalid_image_uri");
  assert.equal(code(() => buildNftMetadata({ name: "Ok", image: "data:image/png;base64,AAAA" })), "invalid_image_uri");
  assert.equal(code(() => buildNftMetadata({ name: "Ok", image, animationUrl: `ipfs://${CID_V1}/video.mp4` })), "invalid_animation_uri");
  assert.equal(code(() => buildNftMetadata({ name: "Ok", image, animationUrl: "https://example.org/v.mp4" })), "invalid_animation_uri");
  const control = buildNftMetadata({ name: "A\u0000b\u0007c", description: "line1\r\nline2\u0001", image });
  assert.equal(control.name, "Abc");
  assert.equal(control.description, "line1\nline2");
});

test("direct-upload hints exist in all 12 locales and do not mention 1.5 MB", () => {
  const langs = ["en", "ru", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];
  const dir = new URL("../src/lib/locales/surfaces/", import.meta.url);
  const files = readdirSync(dir).filter((name) => name.startsWith("nft-media-"));
  assert.equal(files.length, langs.length);
  for (const lang of langs) {
    const copy = JSON.parse(readFileSync(join(dir.pathname, `nft-media-${lang}.json`), "utf8"));
    for (const key of ["imageFileHint", "videoFileHint", "coverHint", "errUnsupportedType", "errTooLarge"]) {
      assert.equal(typeof copy[key], "string", `${lang} ${key}`);
      assert.ok(copy[key].trim().length > 0);
    }
    assert.match(copy.imageFileHint, /GIF|gif/);
    assert.match(copy.imageFileHint, /25/);
    assert.doesNotMatch(JSON.stringify(copy), /1[.,]5/);
  }
});
