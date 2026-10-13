import { NextResponse } from "next/server";

/** Legacy path — use POST /api/telegram/verify-webhook instead. */
export async function POST() {
  return NextResponse.json(
    { error: "moved", webhook: "/api/telegram/verify-webhook" },
    { status: 410 },
  );
}
