import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isDatabaseConfigured } from "@/db";
import {
  claimFounderDemoAirdrop,
  getFounderDemoAirdropStatus,
} from "@/lib/founders/demo-airdrop";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const status = await getFounderDemoAirdropStatus(session.user.id);
  return NextResponse.json(status);
}

export async function POST() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const status = await claimFounderDemoAirdrop(session.user.id);
  return NextResponse.json(status);
}
