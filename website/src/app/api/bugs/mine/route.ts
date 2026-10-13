import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listMyBugReports } from "@/lib/bug-reports/service";

/** GET /api/bugs/mine — the signed-in user's own bug reports (status + reward). */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }
  const reports = await listMyBugReports(userId);
  return NextResponse.json({ reports });
}
