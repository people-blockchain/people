/**
 * Client-safe constants/types for the bug bounty feature. Deliberately has no import of
 * `@/db` (unlike service.ts) so client components (the FAB, the admin panel) can import this
 * without pulling the server-only Postgres driver into the browser bundle.
 */
export const MAX_DESCRIPTION_LEN = 4000;
/** ~500KB raw JPEG, base64-encoded (4/3 overhead) plus the `data:image/...;base64,` prefix. */
export const MAX_SCREENSHOT_DATA_URL_LEN = 700_000;

export const BUG_STATUSES = ["new", "accepted", "duplicate", "fixed", "rejected"] as const;
export type BugStatus = (typeof BUG_STATUSES)[number];

export const BUG_REPORT_TYPES = ["bug", "support"] as const;
export type BugReportType = (typeof BUG_REPORT_TYPES)[number];

/** Default season-0 points when the owner presses Accept/Fixed in Telegram and no reward was set. */
export const DEFAULT_REWARD_POINTS: Record<BugReportType, number> = { bug: 100, support: 20 };

export const BUG_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type BugSeverity = (typeof BUG_SEVERITIES)[number];

export type BugReportContext = {
  url?: string;
  route?: string;
  viewport?: string;
  userAgent?: string;
  theme?: string;
  locale?: string;
  appVersion?: string;
  walletAddress?: string;
};
