#!/usr/bin/env python3
"""Build round demo-token coin icons from design/brand-logos-src (no external APIs)."""

from __future__ import annotations

import base64
import io
import json
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT / "design" / "brand-logos-src"
OUT_DIR = ROOT / "website" / "public" / "seed"

# basename -> (source, bg hex, mark scale, lighten mark, strip light bg from edges, drop shadow)
TOKENS: dict[str, tuple[str, str, float, bool, bool, bool]] = {
    "tROSC": ("ROSCASH_white_logo.png", "#1B9B7A", 0.63, False, True, True),
    "tPITP": ("pitpat.png", "#E8875C", 0.62, False, False, False),
    "tMARK": ("ai-mark-mark.png", "#B8895A", 0.63, False, True, True),
    "tKRDA": ("KredaFi_Logo.png", "#049AAA", 0.62, True, False, True),
    "tMEM": ("MEM.png", "#4F8F3C", 0.62, True, False, True),
    "tGOOD": ("Goodwill Planet.png", "#2BA4C9", 0.63, True, True, True),
}

SIZE = 256
VIEW = 128
LIGHT_BG_TOLERANCE = 20


def _hex_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _is_light_background_pixel(r: int, g: int, b: int, a: int) -> bool:
    if a < 12:
        return True
    return r >= 255 - LIGHT_BG_TOLERANCE and g >= 255 - LIGHT_BG_TOLERANCE and b >= 255 - LIGHT_BG_TOLERANCE


def strip_light_background(im: Image.Image) -> Image.Image:
    """Flood-fill near-white pixels connected to image edges → transparent."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    visited: set[tuple[int, int]] = set()
    q: deque[tuple[int, int]] = deque()

    def seed(x: int, y: int) -> None:
        if _is_light_background_pixel(*px[x, y]):
            q.append((x, y))

    for x in range(w):
        seed(x, 0)
        seed(x, h - 1)
    for y in range(h):
        seed(0, y)
        seed(w - 1, y)

    while q:
        x, y = q.popleft()
        if (x, y) in visited:
            continue
        if not (0 <= x < w and 0 <= y < h):
            continue
        if not _is_light_background_pixel(*px[x, y]):
            continue
        visited.add((x, y))
        q.append((x + 1, y))
        q.append((x - 1, y))
        q.append((x, y + 1))
        q.append((x, y - 1))

    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    for y in range(h):
        for x in range(w):
            if (x, y) in visited:
                continue
            op[x, y] = px[x, y]
    return out


def trim_alpha(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    alpha = im.split()[-1]
    bbox = alpha.getbbox()
    if not bbox:
        return im
    return im.crop(bbox)


def lighten_mark(im: Image.Image) -> Image.Image:
    """Lift dark/colored marks so they read on saturated coin backgrounds."""
    r, g, b, a = im.split()
    rgb = Image.merge("RGB", (r, g, b))
    boosted = ImageChops.screen(rgb, Image.new("RGB", im.size, (48, 48, 48)))
    white_mix = Image.blend(rgb, Image.new("RGB", im.size, (255, 255, 255)), 0.22)
    out = ImageChops.screen(boosted, white_mix)
    return Image.merge("RGBA", (*out.split(), a))


def add_drop_shadow(mark: Image.Image) -> Image.Image:
    """Soft dark shadow behind bright marks for contrast on saturated fills."""
    pad = 14
    w, h = mark.size
    layer = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    alpha = mark.split()[-1]
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    shadow.putalpha(alpha)
    shadow_fill = Image.new("RGBA", (w, h), (15, 25, 35, 110))
    shadow_fill.putalpha(alpha)
    blurred = shadow_fill.filter(ImageFilter.GaussianBlur(radius=3.5))
    layer.alpha_composite(blurred, (pad + 1, pad + 4))
    layer.alpha_composite(mark, (pad, pad))
    return layer


def fit_mark(
    src: Image.Image,
    *,
    scale: float,
    lighten: bool,
    strip_light: bool,
    shadow: bool,
) -> tuple[Image.Image, tuple[int, int, int, int]]:
    im = src.convert("RGBA")
    if strip_light:
        im = strip_light_background(im)
    im = trim_alpha(im)
    if lighten:
        im = lighten_mark(im)

    inner = int(SIZE * scale)
    fitted = im.copy()
    fitted.thumbnail((inner, inner), Image.Resampling.LANCZOS)
    if shadow:
        fitted = add_drop_shadow(fitted)

    x = (SIZE - fitted.width) // 2
    y = (SIZE - fitted.height) // 2
    return fitted, (x, y, fitted.width, fitted.height)


def render_coin(mark_layer: Image.Image, mark_box: tuple[int, int, int, int], bg_hex: str) -> Image.Image:
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    bg = _hex_rgb(bg_hex)
    margin = 3
    draw.ellipse((margin, margin, SIZE - margin - 1, SIZE - margin - 1), fill=bg + (255,))

    x, y, _, _ = mark_box
    canvas.alpha_composite(mark_layer, (x, y))

    ring = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ring_draw = ImageDraw.Draw(ring)
    ring_draw.ellipse(
        (margin + 1, margin + 1, SIZE - margin - 2, SIZE - margin - 2),
        outline=(255, 255, 255, 70),
        width=2,
    )
    ring_draw.ellipse(
        (margin, margin, SIZE - margin - 1, SIZE - margin - 1),
        outline=(0, 0, 0, 55),
        width=1,
    )
    return Image.alpha_composite(canvas, ring)


def write_svg(path: Path, bg_hex: str, mark_layer: Image.Image, mark_box: tuple[int, int, int, int]) -> None:
    x, y, w, h = mark_box
    sx, sy, sw, sh = x * VIEW / SIZE, y * VIEW / SIZE, w * VIEW / SIZE, h * VIEW / SIZE
    buf = io.BytesIO()
    mark_layer.save(buf, format="PNG", optimize=True)
    b64 = base64.standard_b64encode(buf.getvalue()).decode("ascii")
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VIEW} {VIEW}" role="img" aria-hidden="true">
  <defs>
    <clipPath id="coin"><circle cx="{VIEW/2}" cy="{VIEW/2}" r="{VIEW/2 - 1}"/></clipPath>
  </defs>
  <g clip-path="url(#coin)">
    <circle cx="{VIEW/2}" cy="{VIEW/2}" r="{VIEW/2 - 1}" fill="{bg_hex}"/>
    <image href="data:image/png;base64,{b64}" x="{sx:.2f}" y="{sy:.2f}" width="{sw:.2f}" height="{sh:.2f}" preserveAspectRatio="xMidYMid meet"/>
  </g>
  <circle cx="{VIEW/2}" cy="{VIEW/2}" r="{VIEW/2 - 1.5}" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="1.5"/>
  <circle cx="{VIEW/2}" cy="{VIEW/2}" r="{VIEW/2 - 0.5}" fill="none" stroke="#000000" stroke-opacity="0.12" stroke-width="0.75"/>
</svg>
"""
    path.write_text(svg, encoding="utf-8")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, str] = {}
    for base, (src_name, bg, scale, lighten, strip_light, shadow) in TOKENS.items():
        src = SRC_DIR / src_name
        if not src.is_file():
            raise SystemExit(f"missing source logo: {src}")
        mark_layer, mark_box = fit_mark(
            Image.open(src),
            scale=scale,
            lighten=lighten,
            strip_light=strip_light,
            shadow=shadow,
        )
        coin = render_coin(mark_layer, mark_box, bg)
        png_path = OUT_DIR / f"{base}.png"
        svg_path = OUT_DIR / f"{base}.svg"
        coin.save(png_path, format="PNG", optimize=True)
        write_svg(svg_path, bg, mark_layer, mark_box)
        manifest[base] = f"/seed/{base}.svg"
        print(f"wrote {png_path.name}, {svg_path.name}")

    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
