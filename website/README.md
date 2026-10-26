This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Security-relevant environment variables

The full list lives in `.env.example`; these are the ones where the *unset* behaviour
matters for security. All secret comparisons fail closed and use constant-time equality.

| Variable | If unset | Notes |
| --- | --- | --- |
| `AUTH_SECRET` | app refuses to start in runtime | Never falls back to a public placeholder. |
| `PEOPLE_WALLET_VAULT_SECRET` | `GET/POST /api/wallet/vault*` return `503 not_configured` | ≥32 bytes. No `AUTH_SECRET` fallback at runtime; `AUTH_SECRET` is kept only to migrate legacy `vaultVersion === 1` vaults. **Mandatory in production.** |
| `WEB3AUTH_ALLOWED_VERIFIERS` | built-in allowlist (`google`, `email_passwordless`) | Web3Auth logins from any other verifier are rejected; never binds to an account by email alone. |
| `DISCOVER_ADMIN_USER_IDS` | no user is admin by `userId` | Preferred over `DISCOVER_ADMIN_EMAILS`; the email list is only a migration fallback and only for Google logins with a verified email. |
| `CRON_SECRET` | cron routes return `401 not_configured` | Bearer secret for `/api/telegram/daily-summary` and other Vercel crons. |
| `TELEGRAM_BOT_PROFILE_SECRET` | falls back to `CRON_SECRET`, then `401` | Dedicated secret for `POST /api/telegram/bot-profile` (rewrites the bot profile) so a leaked cron secret can't rewrite the bot. Set it in production. |
| `BUG_REPORTS_TELEGRAM_CHAT_ID` | see below | Chat id that receives bug reports. |

### `BUG_REPORTS_TELEGRAM_CHAT_ID`

When it **is set**, that chat id is always the owner: support/bug reports are forwarded
there and its buttons award reward points. No in-bot claim can override it.

When it is **unset**, ownership is claimed once from inside Telegram:

- Sending `/start` (or `support`) from an account whose username matches
  `OWNER_TELEGRAM_USERNAME` makes that chat the owner, *if* no owner is registered yet.
- A one-time claim link/code (`owner_<code>`) also works; it replaces any DB owner and is
  then burned.

After the first successful claim the owner is written to the DB and later claims are
refused, so the exposure window closes as soon as the owner checks in. **Set the env var
in production anyway:** a Telegram username can be released and re-registered by someone
else, and before the real owner claims the bot an attacker who grabs that username can
claim ownership — and the owner sees reporters' emails and can award reward points. The
env var removes the race entirely.

## Brand assets

The approved PEOPLE logo PNG is the visual source of truth. It is committed at
`brand/people-logo-approved.png` and is the **only** input for every logo asset
on the site — the mark is never redrawn, traced or approximated in SVG or CSS.

```bash
python3 scripts/generate-brand-assets.py   # requires Pillow, numpy, ImageMagick
```

That writes `public/brand/` and `public/favicon.ico`:

| File | Purpose |
| --- | --- |
| `people-lockup-{light,dark}{,-2x,-3x}.png` | Symbol + PEOPLE. The site header. |
| `people-lockup-full-{light,dark}{,-2x,-3x}.png` | Symbol + PEOPLE + tagline. Footer and social cards. |
| `icon-{16,32,48,192,512}.png` | Square symbol-only app/favicon/PWA rasters |
| `apple-touch-icon.png` | 180×180, symbol on the brand canvas (iOS ignores alpha) |

Only two lockup shapes exist, and both are cut from the same artwork, so the
light and dark variants cannot drift apart. `src/components/Logo.tsx` picks the
shape via its `variant` prop and swaps the two PNGs with a CSS `dark:` variant —
the site theme is a class on `<html>`, so a `prefers-color-scheme` media query
would desync from the user's toggle.

The header deliberately uses the **compact** lockup. In the approved artwork the
tagline is ¼ of PEOPLE cap height, which at header size is a sub-pixel stroke
that renders as a smear; it is only used where it is large enough to read.

### Social cards

```bash
python3 scripts/generate-og-images.py   # needs Playwright + Chromium, network once
```

Lays out a 1200×630 card in headless Chromium with the site's own Geist fonts
(fetched once from Google Fonts and cached in `brand/fonts/`, OFL-1.1) and
colour tokens, then writes the JPEG to all four paths:

- `public/og-image.jpg`, `src/app/opengraph-image.jpg`, `src/app/twitter-image.jpg` — EN
- `public/og-image-ru.jpg` — RU

`src/app/opengraph-image.jpg` and `src/app/twitter-image.jpg` are Next.js file
conventions, so the `<head>` tags point at them automatically and the card
dimensions are derived from the file. Copy is asserted against
`src/lib/content.ts` on every run, so a card cannot silently drift from the
site's own wording. Note that `*.alt.txt` is not yet consumed by Turbopack
builds, so `og:image:alt` is currently not emitted.

Re-run the scripts only when the approved artwork or the card copy changes.
