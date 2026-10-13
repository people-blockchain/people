import { NextRequest, NextResponse } from "next/server";
import { isDiscoverAdmin } from "@/lib/discover/admin";
import {
  BUG_STATUSES,
  listBugReportsForAdmin,
  patchBugReportAsAdmin,
  type BugSeverity,
  type BugStatus,
} from "@/lib/bug-reports/service";
import { notifyReporterStatus } from "@/lib/bug-reports/telegram-support-bot";

/** GET /api/bugs/admin?status=new — list/filter bug reports. Admin only. */
export async function GET(request: NextRequest) {
  if (!(await isDiscoverAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const statusParam = request.nextUrl.searchParams.get("status");
  const status =
    statusParam && (BUG_STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as BugStatus)
      : undefined;
  const reports = await listBugReportsForAdmin({ status });
  return NextResponse.json({ reports });
}

/** PATCH /api/bugs/admin — set status/severity/rewardPoints/adminNote. Admin only. */
export async function PATCH(request: NextRequest) {
  if (!(await isDiscoverAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const result = await patchBugReportAsAdmin(id, {
    status: typeof body?.status === "string" ? (body.status as BugStatus) : undefined,
    severity:
      body?.severity === null
        ? null
        : typeof body?.severity === "string"
          ? (body.severity as BugSeverity)
          : undefined,
    rewardPoints: typeof body?.rewardPoints === "number" ? body.rewardPoints : undefined,
    adminNote: body?.adminNote === null ? null : typeof body?.adminNote === "string" ? body.adminNote : undefined,
  });

  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  if (typeof body?.status === "string" || result.credited > 0) {
    await notifyReporterStatus(result.report, result.credited).catch(() => {});
  }

  return NextResponse.json({ report: result.report, credited: result.credited });
}
