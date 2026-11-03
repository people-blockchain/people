# First-party visitor analytics (website)

The public Next.js app records privacy-oriented analytics in Postgres: page views, sessions, geo/device breakdowns, and product funnel events. There are **no analytics cookies** for the first-party tracker (the read-only viewer sets an HttpOnly digest cookie after a one-time share URL). Vercel Web Analytics is a separate optional baseline.

## Environment variables

Set these in Vercel (Production + Preview) and in local `.env.local`. **Never commit real values.**

| Variable | Required | Purpose |
| --- | --- | --- |
| `ANALYTICS_SALT_SECRET` | **Yes in production** | Daily rotating salt for visitor ids (IP+UA hashed; raw IP never stored). `openssl rand -base64 32` |
| `ANALYTICS_VIEW_PATH` | Optional | URL segment for the read-only viewer (`/<slug>`). **≥32 characters**, `[A-Za-z0-9_-]` only. If unset, the viewer route 404s. Baked into rewrites at build time on Vercel — set before deploy. **Not** in sitemap or `robots.txt`. |
| `ANALYTICS_VIEW_TOKEN` | Optional | Read-only dashboard secret. Share once: `/<ANALYTICS_VIEW_PATH>/<token>` → HttpOnly cookie (SHA-256 digest only) → `303` to `/<ANALYTICS_VIEW_PATH>`. **Rotating revokes links and cookies.** API/CLI may still use `Authorization: Bearer <token>`. Requires `ANALYTICS_VIEW_PATH`. |
| `CRON_SECRET` | Optional | `GET` or `POST /api/cron/analytics-retention` with `Authorization: Bearer <CRON_SECRET>` (POST also allows discover admin session). Vercel Cron uses GET. |

`DATABASE_URL` must be configured (same as the rest of the partner/founders DB stack).

Also documented in `website/.env.example`.

Legacy **`/stats`** and **`/stats/<token>`** return **404** (no redirects).

## Schema and migrations

- Drizzle SQL: `website/drizzle/0023_analytics.sql`, `website/drizzle/0024_analytics_ga_indexes.sql`
- Runtime bootstrap: `ANALYTICS_SCHEMA_STATEMENTS` + `ANALYTICS_GA_INDEX_STATEMENTS` in `website/src/db/bootstrap-sql.mjs`

Geo stored at country / region / city only (no lat/long). Path prefix queries use `starts_with` + `text_pattern_ops` index.

Apply with your normal Drizzle migrate flow on deploy; cloud agents must **not** run migrations against production.

### Retention

Default policy in code: **13 months** of raw events and sessions.

- **Automated route:** `POST /api/cron/analytics-retention` (Bearer `CRON_SECRET` or discover admin)
- Schedule on Vercel Cron or an external scheduler after deploy approval

Older rows are deleted from `analytics_event` then `analytics_session`.

## Instrumentation

- Client tracker: `AnalyticsTracker` in root layout (**skips** `/admin/*` and the configured secret viewer path)
- Ingest: `POST /api/track` (same-site Origin/Referer, durable rate limit, bot filter)
- Stored paths strip query strings except `utm_*`, `ref`, and `kol`
- Custom events: `import { trackEvent } from "@/lib/analytics/client-track"` (alias `track`) or `window.peopleTrack`
- Automatic: scroll depth (`scroll_depth_25/50/75/90`), outbound clicks, file downloads, `?q=` / `?search=` site search

Respects **Do Not Track**. Uses `sendBeacon` on hide/unload when appropriate.

### Funnel events

| Event | Where |
| --- | --- |
| `founders_register` | `/founders` registration success |
| `founders_verify_success` | Human Passport verification success |
| `buy_connect_wallet` | `/buy` connect wallet CTA |
| `buy_purchase_submitted` | PPL sale checkout order created |
| `buy_purchase_succeeded` | Order status `delivered` |

Dashboard funnels also join **`founder`** and **`ppl_sale_order`**.

## Dashboard (GA-style)

Same UI on **`/admin/analytics`** (discover admin) and the **secret viewer URL** (HttpOnly cookie after share link). Charts load client-side only (`recharts`, world map via `react-simple-maps`).

| Tab | Contents |
| --- | --- |
| Realtime | Active users (5 / 30 min), live pages & countries, 30s auto-refresh |
| Overview | KPIs with compare period, new vs returning, daily + hourly trends |
| Acquisition | Channel grouping, source/medium, UTM dimensions, referrer domains, landing pages |
| Geography | World choropleth (Vercel `x-vercel-ip-country`), country / region / city tables |
| Tech | Device, OS, browser, screen resolution, language |
| Engagement | Page metrics (entrances, exits, exit rate), scroll depth, outbound, downloads, search, events |
| Conversions | Founders & buy funnels with step conversion rates, weekly retention cohorts |
| Journey | Top next-page paths from a selected page (`journeyFrom` query param) |

Date presets: today, 7d, 30d, **90d**, custom (max 366 days). API: `GET /api/admin/analytics?preset=30d&journeyFrom=/buy`.

CSV: per-table buttons and `GET /api/admin/analytics/export?section=<name>` (or `all`).

### Performance

CI runs `scripts/analytics-perf.test.mjs` with **100k** synthetic events by default. For ~1M rows locally:

```bash
ANALYTICS_PERF_ROWS=1000000 node --import ./scripts/node-test-paths.mjs --test scripts/analytics-perf.test.mjs
```

### Not in scope (vs GA4)

Cross-device identity, Google Ads linking, BigQuery native export, ML anomaly alerts, audience builder UI, user-level raw drilldown (privacy model uses salted daily visitor ids), third-party IP enrichment, mobile app streams, sub-second streaming export.

## Dashboard access

- **Admin:** `/admin/analytics` (`isDiscoverAdmin()`)
- **Read-only viewer:** share `/<ANALYTICS_VIEW_PATH>/<ANALYTICS_VIEW_TOKEN>` once → `303` to `/<ANALYTICS_VIEW_PATH>` (token not kept in the address bar). Dashboard fetches use the HttpOnly cookie only (`credentials: "include"`). Rotating `ANALYTICS_VIEW_TOKEN` invalidates the link and existing cookies. Rotating `ANALYTICS_VIEW_PATH` requires a redeploy (rewrite rules) and changes the public URL.
- CSV export: button in UI → `GET /api/admin/analytics/export` with the same cookie (or admin session)

`/admin/*`, the secret viewer URL, and `/api/admin/analytics/*` send `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, and `X-Robots-Tag: noindex, nofollow`. The viewer slug is not listed in `robots.txt` or the sitemap.

## Vercel Web Analytics

`VercelWebAnalytics` wraps `@vercel/analytics` with `beforeSend` dropping admin and secret viewer URLs.

## Tests

From `website/`:

```bash
node --import ./scripts/node-test-paths.mjs --experimental-strip-types --test scripts/analytics-track.test.mjs scripts/analytics-channels.test.mjs scripts/analytics-aggregate.test.mjs scripts/analytics-view-path.test.mjs scripts/analytics-dashboard-dates.test.mjs scripts/analytics-perf.test.mjs
```
