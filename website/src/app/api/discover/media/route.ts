import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkRateLimitDurableFirst } from "@/lib/api-rate-limit";
import { isPinataConfigured } from "@/lib/factory-icon-config";
import { pinBytesToIpfs, toIpfsUri, ipfsGatewayUrl } from "@/lib/ipfs";
import { sniffVideoType } from "@/lib/media-sniff";

const MAX_BYTES = 80_000_000;
const ALLOWED = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const UPLOAD_LIMIT = 5;
const UPLOAD_WINDOW_MS = 60_000;

/** ISO-BMFF (.mp4/.mov) share the `ftyp` header; sniffing may return either family. */
function declaredMatches(sniffed: string, declared: string): boolean {
  if (sniffed === declared) return true;
  const isoFamily = new Set(["video/mp4", "video/quicktime"]);
  return isoFamily.has(sniffed) && isoFamily.has(declared);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }
  if (!(await checkRateLimitDurableFirst("discover-media-upload", session.user.id, UPLOAD_LIMIT, UPLOAD_WINDOW_MS))) {
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
  const sniffed = sniffVideoType(bytes);
  if (!sniffed || !declaredMatches(sniffed, file.type)) {
    return NextResponse.json({ error: "content_type_mismatch" }, { status: 415 });
  }
  const hash = createHash("sha256").update(bytes).digest("hex");
  const ext = sniffed === "video/webm" ? "webm" : sniffed === "video/quicktime" ? "mov" : "mp4";

  if (isPinataConfigured()) {
    try {
      const { cid } = await pinBytesToIpfs(bytes, `discover/${hash}.${ext}`, sniffed);
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

  return NextResponse.json({ error: "pinata_not_configured", fallback: "url" }, { status: 503 });
}
