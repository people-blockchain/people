import { NextResponse } from "next/server";
import { getDbReady, isDatabaseConfigured } from "@/db";
import { parseAnalyticsRange } from "@/lib/analytics/aggregate";
import { queryAnalyticsGaDashboard } from "@/lib/analytics/aggregate-ga";
import { canViewAnalyticsDashboardRequest } from "@/lib/analytics/admin-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const viewer = await canViewAnalyticsDashboardRequest(req);
  if (!viewer) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const preset = url.searchParams.get("preset");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const compare = url.searchParams.get("compare") !== "0";

  const journeyFrom = url.searchParams.get("journeyFrom");

  let ranges;
  try {
    ranges = parseAnalyticsRange(preset, from, to);
  } catch {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  }

  const db = await getDbReady();
  const data = await queryAnalyticsGaDashboard(
    db,
    ranges.range,
    compare ? ranges.compare : undefined,
    journeyFrom,
  );

  return NextResponse.json({ ...data, readOnly: viewer === "token" });
}
