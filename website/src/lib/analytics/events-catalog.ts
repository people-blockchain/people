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

export const ALL_TRACKED_EVENT_NAMES = [
  ...Object.values(SCROLL_DEPTH_EVENTS),
  ...Object.values(ENGAGEMENT_EVENTS),
  ...Object.values(PRODUCT_CLICK_EVENTS),
] as const;
