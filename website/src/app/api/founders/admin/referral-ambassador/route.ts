import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isDiscoverAdmin } from "@/lib/discover/admin";
import { setReferralAmbassador } from "@/lib/founders/referral-service";

/** Manual approval: raises one user's per-season active-invitee cap above 50. */
export async function POST(request: Request) {
  if (!(await isDiscoverAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { userId?: string; maxActiveInvitees?: number };
  const userId = body.userId?.trim();
  if (!userId || typeof body.maxActiveInvitees !== "number") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const session = await auth();
  const approver = session?.user?.email?.trim().toLowerCase() ?? "admin";
  const ok = await setReferralAmbassador(userId, body.maxActiveInvitees, approver);
  if (!ok) return NextResponse.json({ error: "invalid_cap" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
