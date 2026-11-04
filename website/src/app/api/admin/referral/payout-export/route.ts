import { NextResponse } from "next/server";
import { isDiscoverAdmin } from "@/lib/discover/admin";
import {
  buildReferralPayoutExport,
  referralPayoutExportToCsv,
} from "@/lib/partner/payout-export";

export async function GET(request: Request) {
  if (!(await isDiscoverAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format")?.trim().toLowerCase() ?? "json";
  const exportDoc = await buildReferralPayoutExport();

  if (format === "csv") {
    const csv = referralPayoutExportToCsv(exportDoc);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="referral-payout-export-${exportDoc.generatedAt.slice(0, 10)}.csv"`,
      },
    });
  }

  return NextResponse.json({ ok: true, export: exportDoc });
}
