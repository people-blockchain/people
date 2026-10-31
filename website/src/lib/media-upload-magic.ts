/**
 * Magic-byte sniff for a direct upload. Signatures live here so the legacy sniffer can change
 * on its own. GIF is accepted as-is (no re-encode).
 */

import { normalizeUploadMime } from "./media-upload-rules.ts";

const MP4_BRAND = /^(?:isom|iso[2-9]|mp4[12]|avc1|dash|M4V )$/;

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let out = "";
  const stop = Math.min(end, bytes.length);
  for (let i = start; i < stop; i++) out += String.fromCharCode(bytes[i]!);
  return out;
}

/** MIME the leading bytes actually are, or null when the signature is unknown. */
export function sniffDirectMedia(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  const gif = ascii(bytes, 0, 6);
  if (gif === "GIF87a" || gif === "GIF89a") return "image/gif";
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp" && MP4_BRAND.test(ascii(bytes, 8, 12))) return "video/mp4";
  if (
    startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]) &&
    ascii(bytes, 0, Math.min(bytes.length, 4096)).includes("webm")
  ) {
    return "video/webm";
  }
  return null;
}

/** True only when the declared type and the leading bytes name the same format. */
export function mediaBytesMatch(declaredMime: string, bytes: Uint8Array): boolean {
  const declared = normalizeUploadMime(declaredMime);
  return sniffDirectMedia(bytes) === declared;
}
