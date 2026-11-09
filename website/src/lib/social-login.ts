/**
 * Temporary kill-switch for Google/Apple (and Web3Auth social) login after the
 * Web3Auth Login Service outage / Keplr key-leak incident (2026-11-06).
 *
 * Default OFF. Re-enable by setting NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED=true in
 * Vercel (Production + Preview) and redeploying — no code revert required.
 * Original marketing strings are preserved under `*Social` locale keys; when
 * the flag is on, {@link withSocialLoginCopy} prefers those over the base keys.
 */
export function isSocialLoginEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED?.trim().toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/**
 * Pick a locale string that mentions social login only when the flag is on.
 * When social login is disabled, returns `baseKey`; when enabled, prefers
 * `${baseKey}Social` if present (the preserved pre-outage copy).
 */
export function pickSocialCopy<T extends Record<string, unknown>>(
  copy: T,
  baseKey: keyof T & string,
): string {
  if (isSocialLoginEnabled()) {
    const socialKey = `${baseKey}Social` as keyof T;
    const social = copy[socialKey];
    if (typeof social === "string" && social.trim()) return social;
  }
  const base = copy[baseKey];
  return typeof base === "string" ? base : "";
}

function preferSocialKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(preferSocialKeys);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(obj)) {
      if (key.endsWith("Social")) continue;
      const social = obj[`${key}Social`];
      if (typeof social === "string" && social.trim()) {
        out[key] = social;
      } else {
        out[key] = preferSocialKeys(child);
      }
    }
    return out;
  }
  return value;
}

/**
 * When social login is enabled, overlay every `fooSocial` string onto `foo`
 * (deep). When disabled, return the input unchanged (base keys already omit
 * Google/Apple pitches).
 */
export function withSocialLoginCopy<T>(copy: T): T {
  if (!isSocialLoginEnabled()) return copy;
  return preferSocialKeys(copy) as T;
}
