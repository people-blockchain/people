import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { issueWalletChallenge } from "@/lib/partner/service";
import { isAuthConfigured } from "@/lib/partner/guards";
import { SITE_URL } from "@/lib/site";

export async function POST() {
  if (!isAuthConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const origin = process.env.AUTH_URL?.trim() || SITE_URL;
  const challenge = await issueWalletChallenge(session.user.id, session.user.email, origin);
  return NextResponse.json(challenge);
}
