import { NextResponse } from "next/server";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { clientIp } from "@/lib/discover/api-guard";
import { foundersApiGuard } from "@/lib/founders/api-guard";
import { setPublicProfileOptIn } from "@/lib/founders/transparency";

export const dynamic = "force-dynamic";

/**
 * The founder's own opt-in switch for public lists on /transparency. `foundersApiGuard`
 * resolves the userId from the session, so a caller can never flip anyone else's flag.
 * Off by default: the name/avatar are only ever published after an explicit opt-in here.
 */
export async function POST(request: Request) {
  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;

  if (
    !await checkSharedRateLimit(
      "founders-profile-visibility",
      `${guard.userId}:${clientIp(request)}`,
      10,
      60 * 60 * 1000,
    )
  ) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as { optIn?: unknown };
  if (typeof body.optIn !== "boolean") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const optIn = await setPublicProfileOptIn(guard.userId, body.optIn);
  if (optIn === null) {
    return NextResponse.json({ error: "not_founder" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, optIn });
}
