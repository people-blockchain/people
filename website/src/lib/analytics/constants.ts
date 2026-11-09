/** Session ends after this much inactivity (Google Analytics–style). */
export const ANALYTICS_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export const ANALYTICS_EVENT_TYPES = [
  "pageview",
  "heartbeat",
  "visibility",
  "outbound",
  "custom",
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

/** Custom funnel event names wired in product surfaces. */
export const FUNNEL_EVENTS = {
  foundersRegister: "founders_register",
  foundersVerifySuccess: "founders_verify_success",
  buyConnectWallet: "buy_connect_wallet",
  buyPurchaseSubmitted: "buy_purchase_submitted",
  buyPurchaseSucceeded: "buy_purchase_succeeded",
} as const;

export const MAX_TRACK_EVENTS_PER_REQUEST = 25;
export const MAX_TRACK_BODY_BYTES = 32_768;
export const MAX_PATH_LEN = 2048;
export const MAX_TITLE_LEN = 512;
export const MAX_REFERRER_LEN = 2048;
export const MAX_CUSTOM_PROPS_KEYS = 20;
export const MAX_CUSTOM_PROP_STRING_LEN = 256;
