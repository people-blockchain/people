import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkSlidingWindowRateLimit } from "@/lib/api-rate-limit";
import { isPinataConfigured } from "@/lib/factory-icon-config";
import { pinBytesToIpfs, toIpfsUri, ipfsGatewayUrl } from "@/lib/ipfs";
import { sniffImageType } from "@/lib/media-sniff";

const MAX_BYTES = 1_500_000;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);
const UPLOAD_LIMIT = 20;
const UPLOAD_WINDOW_MS = 60_000;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }
  if (!checkSlidingWindowRateLimit("factory-media-upload", session.user.id, UPLOAD_LIMIT, UPLOAD_WINDOW_MS)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  // Corroborate the declared MIME type with the actual file signature.
  const sniffed = sniffImageType(bytes);
  if (!sniffed || sniffed !== file.type) {
    return NextResponse.json({ error: "content_type_mismatch" }, { status: 415 });
  }
  const hash = createHash("sha256").update(bytes).digest("hex");
  const ext = sniffed === "image/png" ? "png" : sniffed === "image/webp" ? "webp" : "jpg";

  if (isPinataConfigured()) {
    try {
      const { cid } = await pinBytesToIpfs(bytes, `factory/${hash}.${ext}`);
      const uri = toIpfsUri(cid);
      return NextResponse.json({
        uri,
        sha256: hash,
        persisted: true,
        previewUrl: ipfsGatewayUrl(cid),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "pin_failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  return NextResponse.json({
    uri: `sha256:${hash}`,
    sha256: hash,
    persisted: false,
  });
}
