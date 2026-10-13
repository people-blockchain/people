import { NextResponse } from "next/server";
import { isDiscoverAdmin } from "@/lib/discover/admin";
import { getReturningUserStats } from "@/lib/discover/service";
import { isDatabaseConfigured } from "@/db";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  if (!(await isDiscoverAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const stats = await getReturningUserStats(14);
  return NextResponse.json(stats);
}
