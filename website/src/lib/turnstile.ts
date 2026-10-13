export async function verifyTurnstileToken(token: string, remoteIp: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    // Fail closed in production: an unconfigured captcha must not silently allow requests.
    // Local/dev builds without the secret keep working.
    return process.env.NODE_ENV !== "production";
  }
  if (!token.trim()) return false;
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret,
      response: token,
      remoteip: remoteIp === "unknown" ? undefined : remoteIp,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { success?: boolean };
  return Boolean(body.success);
}

export function turnstileSiteKeyPublic(): string | null {
  const key = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim();
  return key || null;
}
