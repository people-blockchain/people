import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isDatabaseConfigured } from "@/db";
import { isVerifiedHuman } from "@/lib/discover/verified-human";

export async function foundersApiGuard(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  if (!isDatabaseConfigured()) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unavailable" }, { status: 503 }),
    };
  }
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "sign_in_required" }, { status: 401 }),
    };
  }
  if (!(await isVerifiedHuman(session.user.id))) {
    return {
      ok: false,
      response: NextResponse.json({ error: "wallet_required" }, { status: 403 }),
    };
  }
  return { ok: true, userId: session.user.id };
}
