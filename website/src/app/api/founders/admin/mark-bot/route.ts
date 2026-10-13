import { NextResponse } from "next/server";
import { isDiscoverAdmin } from "@/lib/discover/admin";
import { markFounderAsBot } from "@/lib/founders/service";

export async function POST(request: Request) {
  if (!(await isDiscoverAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await request.json()) as { userId?: string };
  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "invalid_user" }, { status: 400 });
  }
  await markFounderAsBot(userId);
  return NextResponse.json({ ok: true });
}
