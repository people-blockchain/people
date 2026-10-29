import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { processMediaUpload } from "@/lib/factory-media-upload";

const UPLOAD_LIMIT = 20;
const UPLOAD_WINDOW_MS = 60_000;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }
  if (!await checkSharedRateLimit("factory-media-upload", session.user.id, UPLOAD_LIMIT, UPLOAD_WINDOW_MS)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  return processMediaUpload(request);
}
