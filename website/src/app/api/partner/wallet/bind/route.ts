import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { bindWallet } from "@/lib/partner/service";
import { isAuthConfigured } from "@/lib/partner/guards";
import { SITE_URL } from "@/lib/site";

export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { address?: string; publicKey?: string; signature?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.address || !body.publicKey || !body.signature || !body.message) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const origin = process.env.AUTH_URL?.trim() || SITE_URL;
  const result = await bindWallet(session.user.id, session.user.email, origin, {
    address: body.address,
    publicKey: body.publicKey,
    signature: body.signature,
    message: body.message,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, address: result.address });
}
