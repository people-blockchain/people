import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { applyProfile, readToken, validateProfile, verifyProfile } from "../../../../../scripts/telegram-bot-profile.mjs";

/**
 * POST /api/telegram/bot-profile — applies the @PeopleVerifyBot profile (setMyName / setMyDescription /
 * setMyShortDescription / setMyCommands for all 12 site locales) using the server-side bot token, which
 * is a Vercel Sensitive env var and can't be read locally. `?verify=1` only reads back.
 * Locked behind TELEGRAM_BOT_PROFILE_SECRET (Bearer), falling back to CRON_SECRET only when the
 * dedicated secret is unset (audit api-cron L4 — the cron secret also guards daily-summary, so it
 * should not by itself be able to rewrite the bot). Fails closed when neither is set. Never
 * returns the token.
 */
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Dedicated bot-profile secret, with a documented fallback to CRON_SECRET only when unset. */
function botProfileSecret(): string | null {
  return (
    process.env.TELEGRAM_BOT_PROFILE_SECRET?.trim() || process.env.CRON_SECRET?.trim() || null
  );
}

export async function POST(request: Request) {
  const secret = botProfileSecret();
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 401 });
  const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!safeEqual(auth, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const token = readToken();
  if (!token) return NextResponse.json({ error: "bot_token_missing" }, { status: 500 });
  const problems = validateProfile();
  if (problems.length) return NextResponse.json({ error: "invalid_profile", problems }, { status: 500 });

  const verifyOnly = new URL(request.url).searchParams.get("verify") === "1";
  const applied = verifyOnly ? [] : await applyProfile(token);
  const verified = await verifyProfile(token);
  return NextResponse.json({ applied: applied.filter((r: { ok: boolean }) => !r.ok), appliedCount: applied.length, verified });
}
