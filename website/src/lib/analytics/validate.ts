import {
  ANALYTICS_EVENT_TYPES,
  MAX_CUSTOM_PROP_STRING_LEN,
  MAX_CUSTOM_PROPS_KEYS,
  MAX_PATH_LEN,
  MAX_REFERRER_LEN,
  MAX_TITLE_LEN,
  MAX_TRACK_EVENTS_PER_REQUEST,
  type AnalyticsEventType,
} from "./constants";
import { normalizeAnalyticsStoredPath, shouldSkipAnalyticsForPath } from "./paths";

export type TrackPayloadEvent = {
  type: AnalyticsEventType;
  ts?: number;
  path?: string;
  title?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  ref?: string;
  kol?: string;
  screenW?: number;
  screenH?: number;
  lang?: string;
  tz?: string;
  durationMs?: number;
  href?: string;
  visibility?: "hidden" | "visible";
  name?: string;
  props?: Record<string, unknown>;
  webdriver?: boolean;
};

export type TrackPayload = {
  sid: string;
  events: TrackPayloadEvent[];
};

function isShortString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}

function sanitizeProps(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > MAX_CUSTOM_PROPS_KEYS) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of entries) {
    if (typeof k !== "string" || k.length > 64) return null;
    if (typeof v === "string") {
      if (v.length > MAX_CUSTOM_PROP_STRING_LEN) return null;
      out[k] = v;
    } else if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = v;
    } else if (typeof v === "boolean") {
      out[k] = v;
    } else {
      return null;
    }
  }
  return out;
}

function sanitizeEvent(raw: unknown): TrackPayloadEvent | null {
  if (typeof raw !== "object" || raw == null) return null;
  const o = raw as Record<string, unknown>;
  const type = o.type;
  if (typeof type !== "string" || !ANALYTICS_EVENT_TYPES.includes(type as AnalyticsEventType)) {
    return null;
  }
  if (o.ts != null && (typeof o.ts !== "number" || !Number.isFinite(o.ts))) return null;
  if (o.path != null && !isShortString(o.path, MAX_PATH_LEN)) return null;
  if (o.title != null && !isShortString(o.title, MAX_TITLE_LEN)) return null;
  if (o.referrer != null && !isShortString(o.referrer, MAX_REFERRER_LEN)) return null;
  for (const key of ["utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent", "ref", "kol", "lang", "tz", "href", "name"] as const) {
    if (o[key] != null && (typeof o[key] !== "string" || (o[key] as string).length > 256)) return null;
  }
  if (o.screenW != null && (typeof o.screenW !== "number" || o.screenW < 0 || o.screenW > 100_000)) return null;
  if (o.screenH != null && (typeof o.screenH !== "number" || o.screenH < 0 || o.screenH > 100_000)) return null;
  if (o.durationMs != null && (typeof o.durationMs !== "number" || o.durationMs < 0 || o.durationMs > 3_600_000)) {
    return null;
  }
  if (o.visibility != null && o.visibility !== "hidden" && o.visibility !== "visible") return null;
  if (o.webdriver != null && typeof o.webdriver !== "boolean") return null;
  const props = sanitizeProps(o.props);
  if (props === null) return null;
  if (type === "custom" && (typeof o.name !== "string" || o.name.length === 0 || o.name.length > 128)) {
    return null;
  }
  let path: string | undefined;
  if (typeof o.path === "string") {
    const pathname = o.path.split("?")[0] ?? o.path;
    const search = o.path.includes("?") ? o.path.slice(o.path.indexOf("?")) : "";
    if (shouldSkipAnalyticsForPath(pathname)) return null;
    path = normalizeAnalyticsStoredPath(pathname, search);
  }
  return {
    type: type as AnalyticsEventType,
    ts: typeof o.ts === "number" ? o.ts : undefined,
    path,
    title: typeof o.title === "string" ? o.title : undefined,
    referrer: typeof o.referrer === "string" ? o.referrer : undefined,
    utmSource: typeof o.utmSource === "string" ? o.utmSource : undefined,
    utmMedium: typeof o.utmMedium === "string" ? o.utmMedium : undefined,
    utmCampaign: typeof o.utmCampaign === "string" ? o.utmCampaign : undefined,
    utmTerm: typeof o.utmTerm === "string" ? o.utmTerm : undefined,
    utmContent: typeof o.utmContent === "string" ? o.utmContent : undefined,
    ref: typeof o.ref === "string" ? o.ref : undefined,
    kol: typeof o.kol === "string" ? o.kol : undefined,
    screenW: typeof o.screenW === "number" ? o.screenW : undefined,
    screenH: typeof o.screenH === "number" ? o.screenH : undefined,
    lang: typeof o.lang === "string" ? o.lang : undefined,
    tz: typeof o.tz === "string" ? o.tz : undefined,
    durationMs: typeof o.durationMs === "number" ? o.durationMs : undefined,
    href: typeof o.href === "string" ? o.href : undefined,
    visibility: o.visibility === "hidden" || o.visibility === "visible" ? o.visibility : undefined,
    name: typeof o.name === "string" ? o.name : undefined,
    props,
    webdriver: typeof o.webdriver === "boolean" ? o.webdriver : undefined,
  };
}

export function parseTrackPayload(raw: unknown): { ok: true; payload: TrackPayload } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw == null) return { ok: false, error: "invalid_body" };
  const body = raw as Record<string, unknown>;
  if (typeof body.sid !== "string" || body.sid.length < 8 || body.sid.length > 64) {
    return { ok: false, error: "invalid_sid" };
  }
  if (!Array.isArray(body.events) || body.events.length === 0) {
    return { ok: false, error: "empty_events" };
  }
  if (body.events.length > MAX_TRACK_EVENTS_PER_REQUEST) {
    return { ok: false, error: "too_many_events" };
  }
  const events: TrackPayloadEvent[] = [];
  for (const item of body.events) {
    const ev = sanitizeEvent(item);
    if (!ev) return { ok: false, error: "invalid_event" };
    events.push(ev);
  }
  return { ok: true, payload: { sid: body.sid, events } };
}
