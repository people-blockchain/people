# Community stats visibility flag

Set `NEXT_PUBLIC_SHOW_COMMUNITY_STATS=true` (or `1`) in Vercel when public aggregate founder numbers should appear again. Default: **hidden**.

## Gated UI

- `/bounty` — `BountyCommunity` (verified, countries, 1M goal tile, ambassador table)
- `/founders` hero — `FoundersMillionCounterBar` under the hero (guests only)
- `/founders` — million progress bar for signed-in founders (removed entirely; founders only see their own `#`)
- `/transparency` — verified / countries tiles, ambassadors leaderboard, monthly new verified + top countries
- Homepage — `HomeWarmFoundersTeaser` live verified count pill and “next founder #” title variant

## Gated API (same flag)

- `GET /api/founders/million-counter` — omits live `current` when hidden
- `GET /api/founders/transparency` — omits `counters` and `ambassadors`
- `GET /api/founders/stats` — `503` when hidden (homepage teaser)

Copy such as “Million Founders” and “up to one million” stays visible; only live aggregates and progress bars are gated.
