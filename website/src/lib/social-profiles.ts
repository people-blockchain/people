export type SocialProfileId = "x" | "telegram" | "youtube" | "medium";

export type SocialProfile = {
  id: SocialProfileId;
  href: string;
  label: string;
};

/** Set when the Medium profile URL is published; until then SocialLinks hides the icon. */
export const MEDIUM_SOCIAL_HREF: string | null = null;

export const SOCIAL_PROFILES: SocialProfile[] = [
  { id: "x", href: "https://x.com/Peoplebchain", label: "X" },
  { id: "telegram", href: "https://t.me/people_blockchain", label: "Telegram" },
  { id: "youtube", href: "https://www.youtube.com/@PeoplesBlockchain", label: "YouTube" },
  ...(MEDIUM_SOCIAL_HREF ? [{ id: "medium" as const, href: MEDIUM_SOCIAL_HREF, label: "Medium" }] : []),
];

export const SOCIAL_SAME_AS = SOCIAL_PROFILES.map((p) => p.href);
