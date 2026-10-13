/** Basic prompt moderation for icon generation (not a full ML filter). */

const BLOCKED_PATTERNS: RegExp[] = [
  /\b(nsfw|nude|naked|porn|sex|erotic|xxx)\b/i,
  /\b(hitler|nazi|isis|terror)\b/i,
  /\b(apple|google|microsoft|meta|facebook|instagram|tiktok|twitter|x\.com|nike|adidas|coca[\s-]?cola|pepsi|mcdonald|starbucks|disney|marvel|pokemon|pikachu|mickey\s*mouse)\b/i,
  /\b(bitcoin|ethereum|btc|eth)\s*logo\b/i,
  /\b(official|trademark|®|™)\b/i,
];

export type ModerationResult = { ok: true } | { ok: false; code: "blocked_prompt" };

export function moderateIconSubject(subject: string): ModerationResult {
  const text = subject.trim();
  if (!text) {
    return { ok: false, code: "blocked_prompt" };
  }
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      return { ok: false, code: "blocked_prompt" };
    }
  }
  return { ok: true };
}
