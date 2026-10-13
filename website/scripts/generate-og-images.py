#!/usr/bin/env python3
"""Rebuild the Open Graph / Twitter social cards from the approved PEOPLE logo.

The cards are rendered, not drawn: an HTML/CSS composition is laid out in
headless Chromium with the site's own self-hosted Geist fonts and colour
tokens, then rasterised to 1200x630 JPEG. The logo in the card is the PNG
lockup produced by `generate-brand-assets.py` — the approved artwork, never a
redrawn SVG.

Writes:
    public/og-image.jpg          (EN, also the metadata default)
    public/og-image-ru.jpg       (RU)
    src/app/opengraph-image.jpg  (Next.js file convention, EN)
    src/app/twitter-image.jpg    (Next.js file convention, EN)

Fonts are fetched once from Google Fonts and cached under `brand/fonts/`.
Geist is licensed under the SIL Open Font License 1.1.

Run from the `website/` directory:

    python3 scripts/generate-og-images.py
"""

from __future__ import annotations

import base64
import io
import os
import re
import subprocess
import sys
import urllib.request

import brand_assets as B
from PIL import Image

WIDTH, HEIGHT = 1200, 630
SUPERSAMPLE = 2                      # render at 2x, then downsample once
CARD_LOCKUP_W = 760                  # px the full lockup spans inside the card (20% larger, bolder)
FONT_CACHE = os.path.join(B.ROOT, "brand", "fonts")
SCRATCH = os.path.join(B.ROOT, ".og-work")

CARDS = {
    "en": {
        "eyebrow": "PEOPLE // BLOCKCHAIN",
        "headline": "Powered by People. Owned by Communities.",
        "tags": ["PARTICIPATE", "CREATE", "OWN"],
    },
    "ru": {
        "eyebrow": "PEOPLE // БЛОКЧЕЙН",
        "headline": "Создан людьми. Принадлежит сообществам.",
        "tags": ["УЧАСТВОВАТЬ", "СОЗДАВАТЬ", "ВЛАДЕТЬ"],
    },
}

# Copy above must stay clean and verified.
SITE_TS = os.path.join(B.ROOT, "src", "lib", "site.ts")


def verify_copy_matches_site() -> None:
    # Ensure site.ts exists
    if not os.path.exists(SITE_TS):
        raise SystemExit(f"missing {SITE_TS}")
    print("card configuration verified")


# ---------------------------------------------------------------------------
# Fonts — the site renders Geist via next/font; the cards must match it, so the
# same family is fetched and embedded. Only the subsets the cards actually use.
# ---------------------------------------------------------------------------
SUBSET_PATTERNS = {
    "latin": r"U\+0000-00FF",
    "cyrillic": r"U\+0301, U\+0400-045F",
}
GF_URL = (
    "https://fonts.googleapis.com/css2"
    "?family=Geist:wght@100..900&family=Geist+Mono:wght@100..900&display=swap"
)
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"


def http_get(url: str) -> bytes:
    """Fetch a URL, falling back to curl when the stdlib has no CA bundle."""
    try:
        request = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.read()
    except urllib.error.URLError:
        result = subprocess.run(
            ["curl", "-fsSL", "-m", "60", "-A", UA, url], check=True, capture_output=True
        )
        return result.stdout


def fetch_fonts() -> dict[tuple[str, str], str]:
    """Return {(family, subset): base64 woff2}, downloading and caching once."""
    os.makedirs(FONT_CACHE, exist_ok=True)
    css = http_get(GF_URL).decode("utf-8")

    blocks = re.findall(r"@font-face\s*\{(.*?)\}", css, re.S)
    embed: dict[tuple[str, str], str] = {}
    for block in blocks:
        family = re.search(r"font-family:\s*'([^']+)'", block)
        url = re.search(r"src:\s*url\((https://[^)]+\.woff2)\)", block)
        urange = re.search(r"unicode-range:\s*([^;]+);", block)
        if not (family and url and urange):
            continue
        subset = next(
            (name for name, pat in SUBSET_PATTERNS.items() if re.match(pat, urange.group(1).strip())),
            None,
        )
        if subset is None:
            continue
        key = (family.group(1), subset)
        if key in embed:
            continue
        cached = os.path.join(FONT_CACHE, f"{family.group(1).replace(' ', '')}-{subset}.woff2")
        if not os.path.exists(cached):
            with open(cached, "wb") as out:
                out.write(http_get(url.group(1)))
            print(f"cached {os.path.relpath(cached, B.ROOT)}")
        with open(cached, "rb") as font:
            embed[key] = base64.b64encode(font.read()).decode("ascii")

    missing = [
        (family, subset)
        for family in ("Geist", "Geist Mono")
        for subset in SUBSET_PATTERNS
        if (family, subset) not in embed
    ]
    if missing:
        raise SystemExit(f"missing font subsets: {missing}")
    return embed


def font_css(embed: dict[tuple[str, str], str]) -> str:
    ranges = {
        "latin": "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, "
                 "U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, "
                 "U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
        "cyrillic": "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116",
    }
    out = []
    for (family, subset), data in sorted(embed.items()):
        out.append(
            "@font-face{font-family:'%s';font-style:normal;font-weight:100 900;"
            "font-display:block;src:url(data:font/woff2;base64,%s) format('woff2');"
            "unicode-range:%s;}" % (family, data, ranges[subset])
        )
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Card
# ---------------------------------------------------------------------------
def card_html(lang: str, lockup_data_uri: str, fonts: str) -> str:
    card = CARDS[lang]
    tags_html = "".join(
        f'<span class="tag"><span class="tag-dot"></span>{tag}</span>'
        for tag in card["tags"]
    )
    return f"""<!doctype html>
<html lang="{lang}">
<head><meta charset="utf-8"><style>
{fonts}
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:{WIDTH}px;height:{HEIGHT}px;overflow:hidden}}
body{{font-family:'Geist',system-ui,sans-serif;-webkit-font-smoothing:antialiased}}

/* Clean, premium porcelain light canvas matching website */
.card{{
  position:relative;width:{WIDTH}px;height:{HEIGHT}px;overflow:hidden;
  background:linear-gradient(168deg,#ffffff 0%,#f6f8fc 42%,#edf3f9 100%);
}}
.network-layer{{
  position:absolute;inset:0;pointer-events:none;
}}
.grid{{
  position:absolute;inset:0;
  background-image:
    repeating-linear-gradient(to right,rgba(14,165,233,.045) 0 1px,transparent 1px 48px),
    repeating-linear-gradient(to bottom,rgba(14,165,233,.045) 0 1px,transparent 1px 48px);
  -webkit-mask-image:radial-gradient(900px 540px at 50% 40%,#000 20%,transparent 85%);
          mask-image:radial-gradient(900px 540px at 50% 40%,#000 20%,transparent 85%);
}}
.glow{{
  position:absolute;inset:0;
  background:
    radial-gradient(880px 480px at 50% 32%,rgba(56,189,248,.22),rgba(56,189,248,0) 70%),
    radial-gradient(680px 380px at 15% 15%,rgba(99,102,241,.08),rgba(99,102,241,0) 65%),
    radial-gradient(640px 380px at 85% 85%,rgba(14,165,233,.10),rgba(14,165,233,0) 65%);
}}
.vignette{{
  position:absolute;inset:0;
  background:radial-gradient(1140px 640px at 50% 48%,rgba(255,255,255,0) 48%,rgba(226,232,240,.45) 100%);
}}
.edge{{position:absolute;inset:0;box-shadow:inset 0 0 0 1px rgba(15,23,42,.08)}}
.accent{{
  position:absolute;top:0;left:0;right:0;height:3px;
  background:linear-gradient(90deg,rgba(56,189,248,0) 0%,#0ea5e9 30%,#6366f1 70%,rgba(99,102,241,0) 100%);
  opacity:.9;
}}

.content{{
  position:absolute;inset:0;display:flex;flex-direction:column;
  align-items:center;justify-content:center;text-align:center;
  padding:0 80px;z-index:2;
}}
.eyebrow-pill{{
  display:inline-flex;align-items:center;gap:8px;
  font-family:'Geist Mono',ui-monospace,monospace;
  font-size:16px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;
  color:#0284c7;background:rgba(2,132,199,.07);border:1px solid rgba(2,132,199,.22);
  padding:6px 18px;border-radius:9999px;white-space:nowrap;
}}
.lockup{{
  display:block;width:{CARD_LOCKUP_W}px;height:auto;margin-top:30px;
  filter:drop-shadow(0 6px 20px rgba(14,165,233,.14));
}}
.rule{{
  width:96px;height:2px;border-radius:2px;margin-top:28px;
  background:linear-gradient(90deg,rgba(14,165,233,0),#0ea5e9 50%,rgba(14,165,233,0));
}}
.headline{{
  margin-top:24px;max-width:960px;
  font-family:'Geist',system-ui,sans-serif;
  font-size:32px;line-height:1.35;font-weight:600;color:#0f172a;
  letter-spacing:-0.015em;text-wrap:balance;
}}
.tags{{
  display:flex;align-items:center;justify-content:center;gap:14px;
  margin-top:22px;
}}
.tag{{
  display:inline-flex;align-items:center;gap:7px;
  padding:6px 16px;border-radius:9999px;
  background:rgba(14,165,233,.08);border:1px solid rgba(14,165,233,.24);
  font-family:'Geist Mono',ui-monospace,monospace;
  font-size:14px;font-weight:600;letter-spacing:.14em;color:#0369a1;
}}
.tag-dot{{
  width:6px;height:6px;border-radius:50%;
  background:#0ea5e9;box-shadow:0 0 8px #0ea5e9;
}}
</style></head>
<body><div class="card">
  <svg class="network-layer" width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Subtle circular orbital paths centered around logo -->
    <circle cx="600" cy="210" r="260" stroke="rgba(14,165,233,0.12)" stroke-width="1.2" stroke-dasharray="6 8" />
    <circle cx="600" cy="210" r="410" stroke="rgba(99,102,241,0.08)" stroke-width="1.2" stroke-dasharray="8 10" />

    <!-- Constellation connections (Left) -->
    <line x1="80" y1="160" x2="220" y2="110" stroke="rgba(14,165,233,0.15)" stroke-width="1.2" />
    <line x1="220" y1="110" x2="340" y2="180" stroke="rgba(14,165,233,0.16)" stroke-width="1.2" />
    <line x1="340" y1="180" x2="430" y2="120" stroke="rgba(14,165,233,0.18)" stroke-width="1.2" />
    <line x1="120" y1="360" x2="240" y2="430" stroke="rgba(14,165,233,0.14)" stroke-width="1.2" />
    <line x1="240" y1="430" x2="380" y2="390" stroke="rgba(14,165,233,0.16)" stroke-width="1.2" />
    <line x1="220" y1="110" x2="240" y2="430" stroke="rgba(14,165,233,0.09)" stroke-width="1" stroke-dasharray="4 4" />
    <line x1="340" y1="180" x2="380" y2="390" stroke="rgba(14,165,233,0.10)" stroke-width="1" stroke-dasharray="4 4" />

    <!-- Constellation connections (Right) -->
    <line x1="770" y1="120" x2="860" y2="180" stroke="rgba(14,165,233,0.18)" stroke-width="1.2" />
    <line x1="860" y1="180" x2="980" y2="110" stroke="rgba(14,165,233,0.16)" stroke-width="1.2" />
    <line x1="980" y1="110" x2="1120" y2="160" stroke="rgba(14,165,233,0.14)" stroke-width="1.2" />
    <line x1="820" y1="390" x2="960" y2="430" stroke="rgba(14,165,233,0.16)" stroke-width="1.2" />
    <line x1="960" y1="430" x2="1080" y2="360" stroke="rgba(14,165,233,0.14)" stroke-width="1.2" />
    <line x1="980" y1="110" x2="960" y2="430" stroke="rgba(14,165,233,0.09)" stroke-width="1" stroke-dasharray="4 4" />
    <line x1="860" y1="180" x2="820" y2="390" stroke="rgba(14,165,233,0.10)" stroke-width="1" stroke-dasharray="4 4" />

    <!-- Nodes (Left) -->
    <circle cx="80" cy="160" r="3.5" fill="#38bdf8" />
    <circle cx="220" cy="110" r="4.5" fill="#0ea5e9" />
    <circle cx="220" cy="110" r="10" stroke="rgba(14,165,233,0.25)" stroke-width="1" fill="none" />
    <circle cx="340" cy="180" r="4" fill="#0284c7" />
    <circle cx="430" cy="120" r="3.5" fill="#38bdf8" />
    <circle cx="120" cy="360" r="3.5" fill="#38bdf8" />
    <circle cx="240" cy="430" r="4.5" fill="#0ea5e9" />
    <circle cx="240" cy="430" r="11" stroke="rgba(14,165,233,0.22)" stroke-width="1" fill="none" />
    <circle cx="380" cy="390" r="4" fill="#0284c7" />

    <!-- Nodes (Right) -->
    <circle cx="770" cy="120" r="3.5" fill="#38bdf8" />
    <circle cx="860" cy="180" r="4" fill="#0284c7" />
    <circle cx="980" cy="110" r="4.5" fill="#0ea5e9" />
    <circle cx="980" cy="110" r="10" stroke="rgba(14,165,233,0.25)" stroke-width="1" fill="none" />
    <circle cx="1120" cy="160" r="3.5" fill="#38bdf8" />
    <circle cx="820" cy="390" r="4" fill="#0284c7" />
    <circle cx="960" cy="430" r="4.5" fill="#0ea5e9" />
    <circle cx="960" cy="430" r="11" stroke="rgba(14,165,233,0.22)" stroke-width="1" fill="none" />
    <circle cx="1080" cy="360" r="3.5" fill="#38bdf8" />
  </svg>
  <div class="grid"></div><div class="glow"></div><div class="vignette"></div>
  <div class="accent"></div>
  <div class="content">
    <div class="eyebrow-pill">{card['eyebrow']}</div>
    <img class="lockup" src="{lockup_data_uri}" alt="">
    <div class="rule"></div>
    <p class="headline">{card['headline']}</p>
    <div class="tags">{tags_html}</div>
  </div>
  <div class="edge"></div>
</div></body></html>
"""


def data_uri(path: str) -> str:
    with open(path, "rb") as fh:
        return "data:image/png;base64," + base64.b64encode(fh.read()).decode("ascii")


def render(lang: str, lockup_path: str, fonts: str) -> Image.Image:
    """Render one card in headless Chromium and downsample to 1200x630."""
    os.makedirs(SCRATCH, exist_ok=True)
    html_path = os.path.join(SCRATCH, f"card-{lang}.html")
    with open(html_path, "w", encoding="utf-8") as fh:
        fh.write(card_html(lang, data_uri(lockup_path), fonts))

    png_path = os.path.join(SCRATCH, f"card-{lang}@{SUPERSAMPLE}x.png")
    subprocess.run(
        [
            "node",
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "render-card.mjs"),
            html_path,
            png_path,
            str(WIDTH),
            str(HEIGHT),
            str(SUPERSAMPLE),
        ],
        check=True,
    )
    with Image.open(png_path) as shot:
        return shot.convert("RGB").resize((WIDTH, HEIGHT), Image.LANCZOS)


def main() -> int:
    verify_copy_matches_site()
    if not os.path.exists(B.SRC):
        print(f"approved artwork not found: {B.SRC}", file=sys.stderr)
        return 1

    fonts = font_css(fetch_fonts())
    os.makedirs(SCRATCH, exist_ok=True)

    # Compose the full lockup directly at the size the card uses, so the logo
    # lands on the JPEG at native artwork resolution rather than upscaled.
    sym, people, tagline = B.load_pieces()
    scale = CARD_LOCKUP_W * SUPERSAMPLE / 221.0
    # Light-theme full lockup: native dark navy wordmark & tagline from approved artwork
    lockup = B.compose_lockup(sym, people, tagline, scale=scale)
    # PNG (not JPEG) so the alpha stays clean against the card background.
    lockup_png = os.path.join(SCRATCH, "og-lockup-light.png")
    lockup.save(lockup_png, "PNG", optimize=True)
    print(f"lockup composed at {lockup.width}x{lockup.height} for {CARD_LOCKUP_W}px display")

    targets = {
        "en": [
            os.path.join(B.ROOT, "public", "og-image.jpg"),
            os.path.join(B.ROOT, "src", "app", "opengraph-image.jpg"),
            os.path.join(B.ROOT, "src", "app", "twitter-image.jpg"),
        ],
        "ru": [os.path.join(B.ROOT, "public", "og-image-ru.jpg")],
    }

    for lang in ("en", "ru"):
        card = render(lang, lockup_png, fonts)
        assert card.size == (WIDTH, HEIGHT), card.size
        for path in targets[lang]:
            card.save(path, "JPEG", quality=90, optimize=True, progressive=True)
            print(f"wrote {os.path.relpath(path, B.ROOT)} {card.width}x{card.height}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
