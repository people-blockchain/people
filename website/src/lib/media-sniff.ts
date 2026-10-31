/**
 * Magic-byte sniffing for uploaded media. The browser-supplied MIME type is attacker
 * controlled, so the declared type must be corroborated by the file's leading bytes
 * before the content is pinned to IPFS.
 */

function startsWith(bytes: Buffer, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

function asciiAt(bytes: Buffer, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  return bytes.subarray(offset, offset + text.length).toString("latin1") === text;
}

export type SniffedImageType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";
export type SniffedVideoType = "video/mp4" | "video/webm" | "video/quicktime";

export function sniffImageType(bytes: Buffer): SniffedImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WEBP")) return "image/webp";
  // GIF87a / GIF89a plus the 7-byte logical screen descriptor (animated GIFs are stored as is).
  if (bytes.length >= 13 && (asciiAt(bytes, 0, "GIF87a") || asciiAt(bytes, 0, "GIF89a"))) return "image/gif";
  return null;
}

export function sniffVideoType(bytes: Buffer): SniffedVideoType | null {
  // EBML header — WebM.
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";
  // ISO base media file format: `....ftyp<brand>`.
  if (asciiAt(bytes, 4, "ftyp")) {
    const brand = bytes.subarray(8, 12).toString("latin1");
    if (brand.startsWith("qt")) return "video/quicktime";
    return "video/mp4";
  }
  return null;
}
