import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { isPinataConfigured } from "@/lib/factory-icon-config";
import { pinBytesToIpfs, toIpfsUri, ipfsGatewayUrl } from "@/lib/ipfs";
import { sniffImageType } from "@/lib/media-sniff";
import { readRequestBytesCapped } from "@/lib/nft-upload-server";
import { UPLOAD_MAX_BYTES } from "@/lib/upload-response";

const MAX_BYTES = UPLOAD_MAX_BYTES;
/** Multipart overhead on top of the largest file. */
const BODY_SLACK_BYTES = 100_000;
// GIF is stored byte for byte (animation kept); nothing here re-encodes through a canvas.
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const EXT: Record<string, string> = { "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/jpeg": "jpg" };

/** Everything after sign-in and rate limiting: size, type and signature checks, then pin. Split out so tests can call it without a session. */
export async function processMediaUpload(request: Request): Promise<Response> {
  // Content-Length is checked before the body is read; a stream without one is cut off at the cap.
  const raw = await readRequestBytesCapped(request, MAX_BYTES + BODY_SLACK_BYTES);
  if (!raw) {
    return NextResponse.json({ error: "file_too_large", maxBytes: MAX_BYTES }, { status: 413 });
  }
  let file: FormDataEntryValue | null = null;
  try {
    const form = await new Request(request.url, { method: "POST", headers: request.headers, body: raw as BodyInit }).formData();
    file = form.get("file");
  } catch {
    file = null;
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large", maxBytes: MAX_BYTES }, { status: 413 });
  }
  if (file.size <= 0) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  // Corroborate the declared MIME type with the actual file signature.
  const sniffed = sniffImageType(bytes);
  if (!sniffed || sniffed !== file.type) {
    return NextResponse.json({ error: "content_type_mismatch" }, { status: 415 });
  }
  const hash = createHash("sha256").update(bytes).digest("hex");
  const ext = EXT[sniffed] ?? "jpg";

  if (isPinataConfigured()) {
    try {
      const { cid } = await pinBytesToIpfs(bytes, `factory/${hash}.${ext}`, sniffed);
      const uri = toIpfsUri(cid);
      return NextResponse.json({
        uri,
        sha256: hash,
        persisted: true,
        previewUrl: ipfsGatewayUrl(cid),
      });
    } catch (err) {
      console.error("factory media pin failed", err instanceof Error ? err.message : err);
      return NextResponse.json({ error: "pin_failed" }, { status: 502 });
    }
  }

  return NextResponse.json({
    uri: `sha256:${hash}`,
    sha256: hash,
    persisted: false,
  });
}
