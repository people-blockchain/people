/** Named product events (GA4-style) — stored as custom events. */

export const SCROLL_DEPTH_EVENTS = {
  p25: "scroll_depth_25",
  p50: "scroll_depth_50",
  p75: "scroll_depth_75",
  p90: "scroll_depth_90",
} as const;

export const ENGAGEMENT_EVENTS = {
  fileDownload: "file_download",
  siteSearch: "site_search",
  outboundClick: "outbound_click",
} as const;

export const PRODUCT_CLICK_EVENTS = {
  joinCta: "click_join",
  buyCta: "click_buy",
  connectWallet: "click_connect_wallet",
  registerFounder: "click_register_founder",
} as const;

/**
 * Founding 1,000 conversion layer. Fired only on user actions or once-per-session shows
 * (never on a timer); `simulator_interact` at most once per page view.
 */
export const FOUNDING_CONVERSION_EVENTS = {
  stickyBarClick: "sticky_bar_click",
  scrollDrawerShow: "scroll_drawer_show",
  scrollDrawerClick: "scroll_drawer_click",
  exitIntentShow: "exit_intent_show",
  emailWaitlistSubmit: "email_waitlist_submit",
  tgDeeplinkClick: "tg_deeplink_click",
  tgVerifiedPending: "tg_verified_pending",
  walletSealed1000: "wallet_sealed_1000",
  passportCompleted: "passport_completed",
  simulatorInteract: "simulator_interact",
} as const;

export type FoundingConversionEvent =
  (typeof FOUNDING_CONVERSION_EVENTS)[keyof typeof FOUNDING_CONVERSION_EVENTS];

export const ALL_TRACKED_EVENT_NAMES = [
  ...Object.values(SCROLL_DEPTH_EVENTS),
  ...Object.values(ENGAGEMENT_EVENTS),
  ...Object.values(PRODUCT_CLICK_EVENTS),
  ...Object.values(FOUNDING_CONVERSION_EVENTS),
] as const;
