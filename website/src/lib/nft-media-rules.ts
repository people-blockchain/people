/**
 * Single source of truth for NFT media limits and validation (server and client).
 *
 * The limits mirror what PeopleScan accepts when it renders an NFT (see
 * `docs/NFT-MEDIA.md` in that project): metadata JSON up to 262,144 bytes, rasters under its
 * 2,000,000-byte cap, SVG up to 262,144 bytes, MP4/WebM up to 20,000,000 bytes. Everything here
 * is plain `Uint8Array` code so it runs in Node route handlers and in the browser.
 */

export const NFT_IMAGE_MAX_BYTES = 1_500_000;
export const NFT_SVG_MAX_BYTES = 262_144;
export const NFT_VIDEO_MAX_BYTES = 20_000_000;
export const NFT_NAME_MIN = 2;
export const NFT_NAME_MAX = 200;
export const NFT_DESCRIPTION_MAX = 8000;
export const NFT_METADATA_MAX_BYTES = 262_144;
/** Bytes of a video that are enough to validate its container header. */
export const NFT_VIDEO_HEAD_BYTES = 4096;

export type NftImageKind = "png" | "jpeg" | "webp" | "svg";
export type NftVideoType = "video/mp4" | "video/webm";

export const NFT_IMAGE_MIME: Record<NftImageKind, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};

export const NFT_IMAGE_EXT: Record<NftImageKind, string> = {
  png: "png",
  jpeg: "jpg",
  webp: "webp",
  svg: "svg",
};

export const NFT_VIDEO_TYPES: readonly NftVideoType[] = ["video/mp4", "video/webm"];

export function isNftVideoType(value: unknown): value is NftVideoType {
  return value === "video/mp4" || value === "video/webm";
}

export function imageKindFromMime(mime: string): NftImageKind | null {
  const type = mime.split(";")[0]?.trim().toLowerCase();
  if (type === "image/png") return "png";
  if (type === "image/jpeg" || type === "image/jpg") return "jpeg";
  if (type === "image/webp") return "webp";
  if (type === "image/svg+xml") return "svg";
  return null;
}

/** Largest allowed file for an image kind. */
export function maxBytesForImage(kind: NftImageKind): number {
  return kind === "svg" ? NFT_SVG_MAX_BYTES : NFT_IMAGE_MAX_BYTES;
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let out = "";
  for (let i = start; i < end && i < bytes.length; i++) out += String.fromCharCode(bytes[i]!);
  return out;
}

const SVG_PROLOG =
  /^﻿?\s*(?:<\?xml[^>]*\?>\s*|<!--[\s\S]*?-->\s*|<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>\s*)*<svg[\s>/]/;

/**
 * Decides what an uploaded image really is from its leading bytes. SVG is text, so it is
 * recognized by an optional BOM, XML declaration and comments followed by an `<svg` root. HTML
 * dressed up as SVG, or a raster renamed to `.svg`, does not match.
 */
export function sniffNftImage(bytes: Uint8Array): NftImageKind | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "webp";
  const head = new TextDecoder("utf-8").decode(bytes.subarray(0, 4096));
  if (SVG_PROLOG.test(head)) return "svg";
  return null;
}

const MP4_BRAND = /^(?:isom|iso[2-9]|mp4[12]|avc1|dash|M4V )$/;

/**
 * Container check for a video, identical to PeopleScan's `validVideo`. `head` is the first
 * bytes of the file (at least 12, up to `NFT_VIDEO_HEAD_BYTES` are used) and `totalSize` the
 * full file length. QuickTime (`qt  `) and unknown brands are rejected because PeopleScan would
 * not play them.
 */
export function validVideoHeader(head: Uint8Array, declaredType: string, totalSize: number): boolean {
  if (!Number.isInteger(totalSize) || totalSize <= 0 || totalSize > NFT_VIDEO_MAX_BYTES) return false;
  if (declaredType === "video/mp4") {
    if (totalSize < 24 || head.length < 12) return false;
    const boxSize = ((head[0]! << 24) | (head[1]! << 16) | (head[2]! << 8) | head[3]!) >>> 0;
    return ascii(head, 4, 8) === "ftyp" && boxSize >= 16 && boxSize <= totalSize && MP4_BRAND.test(ascii(head, 8, 12));
  }
  if (declaredType === "video/webm") {
    return (
      totalSize >= 16 &&
      head.length >= 16 &&
      startsWith(head, [0x1a, 0x45, 0xdf, 0xa3]) &&
      ascii(head, 0, NFT_VIDEO_HEAD_BYTES).includes("webm")
    );
  }
  return false;
}

const CID_V0 = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
const CID_V1 = /^b[a-z2-7]{58,120}$/;
const PATH_SEGMENT = /^[A-Za-z0-9._-]{1,120}$/;

export function isNftCid(value: string): boolean {
  return CID_V0.test(value) || CID_V1.test(value);
}

/** `ipfs://<cid>` with an optional safe path (`image.svg`, `metadata.json`). */
export function parseIpfsMediaUri(uri: string): { cid: string; path: string } | null {
  if (typeof uri !== "string" || uri.length > 400 || !uri.startsWith("ipfs://")) return null;
  const [cid = "", ...segments] = uri.slice("ipfs://".length).split("/");
  if (!isNftCid(cid)) return null;
  for (const segment of segments) {
    if (segment === "." || segment === ".." || !PATH_SEGMENT.test(segment)) return null;
  }
  return { cid, path: segments.join("/") };
}

function isPublicHttpsHost(hostname: string): boolean {
  if (!hostname.includes(".") || hostname.startsWith("[")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return false;
  const lower = hostname.toLowerCase();
  return lower !== "localhost" && !lower.endsWith(".localhost") && !lower.endsWith(".local") && !lower.endsWith(".internal");
}

/**
 * Only permanent-looking public addresses may go into metadata: `ipfs://` or `https://`
 * (no credentials, default port, public host name). `blob:`, `data:`, `http:`, `javascript:`
 * and anything else is rejected.
 */
export function isAllowedMediaUri(uri: unknown): uri is string {
  if (typeof uri !== "string" || uri.length === 0 || uri.length > 2048) return false;
  if (uri.startsWith("ipfs://")) return parseIpfsMediaUri(uri) !== null;
  if (!uri.startsWith("https://")) return false;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;
  return isPublicHttpsHost(url.hostname);
}

/** `ipfs://<cid>` without a path: what the video verification step returns. */
export function isBareIpfsUri(uri: unknown): uri is string {
  if (typeof uri !== "string") return false;
  const parsed = parseIpfsMediaUri(uri);
  return parsed !== null && parsed.path === "";
}

export type NftMetadataErrorCode =
  | "invalid_name"
  | "invalid_description"
  | "invalid_image_uri"
  | "invalid_animation_uri"
  | "metadata_too_large";

export class NftMetadataError extends Error {
  readonly code: NftMetadataErrorCode;
  constructor(code: NftMetadataErrorCode) {
    super(code);
    this.code = code;
    this.name = "NftMetadataError";
  }
}

/** Strips control characters except newline and tab. */
export function cleanNftText(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

export type NftMetadata = {
  name: string;
  description?: string;
  image: string;
  animation_url?: string;
};

/**
 * ERC-721 metadata JSON with the key order `name, description, image, animation_url`.
 * `description` is omitted when empty and `animation_url` exists only for video.
 */
export function buildNftMetadata(input: {
  name: string;
  description?: string;
  image: string;
  animationUrl?: string | null;
}): NftMetadata {
  const name = cleanNftText(input.name ?? "").trim();
  if (name.length < NFT_NAME_MIN || name.length > NFT_NAME_MAX) throw new NftMetadataError("invalid_name");
  const description = cleanNftText(input.description ?? "").trim();
  if (description.length > NFT_DESCRIPTION_MAX) throw new NftMetadataError("invalid_description");
  if (!isAllowedMediaUri(input.image)) throw new NftMetadataError("invalid_image_uri");
  const hasVideo = input.animationUrl !== undefined && input.animationUrl !== null;
  if (hasVideo && !isBareIpfsUri(input.animationUrl)) throw new NftMetadataError("invalid_animation_uri");
  // Key order is part of the contract: name, description, image, animation_url.
  const metadata: NftMetadata = {
    name,
    ...(description ? { description } : {}),
    image: input.image,
    ...(hasVideo ? { animation_url: input.animationUrl as string } : {}),
  };
  if (new TextEncoder().encode(JSON.stringify(metadata)).length > NFT_METADATA_MAX_BYTES) {
    throw new NftMetadataError("metadata_too_large");
  }
  return metadata;
}
