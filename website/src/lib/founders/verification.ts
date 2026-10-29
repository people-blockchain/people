/** Founder verification tiers (free tiers only). */

export type FounderVerificationLevel = 0 | 1 | 2;

export const VERIFICATION_LEVEL_NONE = 0;
export const VERIFICATION_LEVEL_TELEGRAM_PHONE = 1;
export const VERIFICATION_LEVEL_STRONG = 2;

/** Human verification at 100% of base points (strong tier). */
export const VERIFICATION_POINTS_FACTOR_FULL = 1;
/** Telegram phone tier — half of the strong verification points factor. */
export const VERIFICATION_POINTS_FACTOR_TELEGRAM = 0.5;

/** Level 1 earns 50% of base points; level 2 earns 100%. */
export function verificationPointsFactor(level: FounderVerificationLevel): number {
  if (level >= VERIFICATION_LEVEL_STRONG) return VERIFICATION_POINTS_FACTOR_FULL;
  if (level >= VERIFICATION_LEVEL_TELEGRAM_PHONE) return VERIFICATION_POINTS_FACTOR_TELEGRAM;
  return 0;
}

export function canEarnFounderPoints(level: FounderVerificationLevel): boolean {
  return level >= VERIFICATION_LEVEL_TELEGRAM_PHONE;
}

/**
 * M20-4: free factory icon generations are a founder perk. Only a wallet bound to a founder
 * verified via Telegram phone (level 1) or a strong/human check (level 2 — Human Passport) qualifies. Anything else (unregistered wallet,
 * level 0) must pay.
 */
export function isFounderVerifiedForFreeIcons(level: FounderVerificationLevel): boolean {
  return level >= VERIFICATION_LEVEL_TELEGRAM_PHONE;
}

export function normalizePhoneE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return `+${digits}`;
}
