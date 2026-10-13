export type SocialProfileId = "x" | "telegram" | "youtube";

export type SocialProfile = {
  id: SocialProfileId;
  href: string;
  label: string;
};

export const SOCIAL_PROFILES: SocialProfile[] = [
  { id: "x", href: "https://x.com/Peoplebchain", label: "X" },
  { id: "telegram", href: "https://t.me/people_blockchain", label: "Telegram" },
  { id: "youtube", href: "https://www.youtube.com/@PeoplesBlockchain", label: "YouTube" },
];

export const SOCIAL_SAME_AS = SOCIAL_PROFILES.map((p) => p.href);
