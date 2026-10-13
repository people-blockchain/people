"""Shared drawing library for the PEOPLE brand assets.

Everything the site shows of the logo comes from one input: the approved PNG at
`brand/people-logo-approved.png`. It is a single image holding two presentations
side by side:

    left  half — light-theme lockup on a TRANSPARENT background
    right half — dark-theme lockup on an opaque dark background (with glow)

That PNG is the visual source of truth. NOTHING here redraws, traces or
approximates the logo. Every exported pixel is a direct crop of the approved
artwork; the only transforms applied are:

  * cropping the artwork into its existing pieces (symbol / PEOPLE / tagline);
  * clearing generator alpha noise on the transparent background;
  * recolouring the dark-navy ink to white for the dark-theme wordmark;
  * re-flowing those same pieces into horizontal lockups.

The dark-theme lockup re-uses the *same* symbol pixels as the light-theme
lockup, so "identical symbol and geometry" holds by construction.

Consumers: `generate-brand-assets.py` (site + app icons) and
`generate-og-images.py` (social cards).
"""

from __future__ import annotations

import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "brand", "people-logo-approved.png")
OUT = os.path.join(ROOT, "public", "brand")

# --------------------------------------------------------------------------
# Geometry measured directly from the approved PNG (left / light half).
# Coordinates are native artwork pixels: (x0, y0, x1, y1), x1/y1 exclusive.
# --------------------------------------------------------------------------
HALF_W = 887                      # the PNG is exactly two 887px panels
SYMBOL = (211, 117, 675, 546)     # 464 x 429
PEOPLE = (113, 577, 780, 705)     # 667 x 128  (cap height)
TAGLINE = (153, 725, 742, 767)    # 589 x 42   (ascender top .. descender bottom)
PEOPLE_CAP = 128                  # native cap height of PEOPLE
TAGLINE_CAP = 32                  # native cap height inside TAGLINE
ALPHA_FLOOR = 12                  # generator noise below this -> fully transparent
BLUE_MIN_SAT = 100                # saturation above which a pixel is brand blue

# --------------------------------------------------------------------------
# Lockup proportions, in logical CSS pixels relative to a 40px-tall symbol.
#
# `people_cap` is a straight re-scale of the approved wordmark. `tagline_cap` is
# the one deliberate deviation: in the approved artwork the tagline is 1/4 of
# PEOPLE's cap height, i.e. ~4.5px in a 40px lockup, where its 3.3px native
# strokes collapse to sub-pixel coverage and render as a faint smear. It is
# therefore set at 9px cap — the relationship the site header already uses
# between its own two text lines — and the lockup is only used at sizes where
# that stays legible (the header uses the symbol+PEOPLE lockup instead).
# --------------------------------------------------------------------------
SYMBOL_H = 40                     # lockup height == symbol height
PEOPLE_CAP_PX = 18
TAGLINE_CAP_PX = 9.0
SYMBOL_GAP_PX = 12                # symbol -> text block
LINE_GAP_PX = 4                   # PEOPLE baseline -> tagline ascender top

SCALES = (1, 2, 3)                     # exported raster densities
ICON_SIZES = (16, 32, 48, 192, 512)    # symbol-only app icon raster set


def load_pieces() -> tuple[Image.Image, Image.Image, Image.Image]:
    """Crop the approved light half into its three existing pieces."""
    src = Image.open(SRC).convert("RGBA")
    arr = np.array(src)
    left = arr[:, :HALF_W].copy()
    # The PNG's transparent background carries 1..11 alpha noise from the
    # generator; clear it so the asset composites cleanly on any surface.
    left[left[:, :, 3] < ALPHA_FLOOR, 3] = 0

    def piece(box):
        x0, y0, x1, y1 = box
        return Image.fromarray(left[y0:y1, x0:x1].copy(), "RGBA")

    return piece(SYMBOL), piece(PEOPLE), piece(TAGLINE)


def to_dark(img: Image.Image) -> Image.Image:
    """Light-theme artwork -> dark-theme artwork.

    Alpha and geometry are untouched. Only the dark ink (wordmark body and
    tagline) becomes white; the brand-blue artwork — the gradient symbol and
    the gradient "O" of PEOPLE — passes through unchanged.

    The split is saturation. On the approved PNG the ink sits at 20-60 with a
    long thin tail of dark navy fringing, the gradient symbol's blue starts at
    160 and the "O" of PEOPLE runs from ~100 to 255. BLUE_MIN_SAT sits inside
    that tail: everything darker/neutral is ink and goes white, so the
    generator's navy fringing cannot survive as grit inside the white wordmark.
    """
    arr = np.array(img).astype(np.int16)
    rgb = arr[:, :, :3]
    neutral = ((rgb.max(axis=2) - rgb.min(axis=2)) < BLUE_MIN_SAT) & (arr[:, :, 3] > 0)
    arr[neutral, 0] = arr[neutral, 1] = arr[neutral, 2] = 255
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def scale_to(img: Image.Image, factor: float) -> Image.Image:
    size = (max(1, round(img.width * factor)), max(1, round(img.height * factor)))
    return img.resize(size, Image.LANCZOS)


def compose_lockup(
    sym: Image.Image,
    people: Image.Image,
    tagline: Image.Image | None = None,
    *,
    scale: float = 1.0,
) -> Image.Image:
    """Re-flow the approved pieces into a horizontal lockup.

    `scale` multiplies the logical lockup size, so a density is composed
    *directly* from the native artwork rather than by upscaling a small
    composite. Passing `tagline=None` yields the symbol + PEOPLE lockup used in
    the site header.
    """
    k = SYMBOL_H * scale / sym.height
    s_people = PEOPLE_CAP_PX * scale / float(PEOPLE_CAP)

    sym = scale_to(sym, k)
    people = scale_to(people, s_people)

    if tagline is None:
        text_h = people.height
        text_w = people.width
    else:
        tagline = scale_to(tagline, TAGLINE_CAP_PX * scale / float(TAGLINE_CAP))
        text_h = round(PEOPLE_CAP_PX * scale) + round(LINE_GAP_PX * scale) + tagline.height
        text_w = max(people.width, tagline.width)

    gap = round(SYMBOL_GAP_PX * scale)
    width = sym.width + gap + text_w
    height = max(sym.height, text_h)

    out = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    out.alpha_composite(sym, (0, (height - sym.height) // 2))
    tx = sym.width + gap
    ty = (height - text_h) // 2
    out.alpha_composite(people, (tx, ty))
    if tagline is not None:
        out.alpha_composite(tagline, (tx, ty + round(PEOPLE_CAP_PX * scale) + round(LINE_GAP_PX * scale)))
    return out


def square_mark(sym: Image.Image, pad_ratio: float = 0.06) -> Image.Image:
    """The approved symbol centred on a transparent square canvas."""
    side = round(max(sym.width, sym.height) * (1 + 2 * pad_ratio))
    out = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    out.alpha_composite(sym, ((side - sym.width) // 2, (side - sym.height) // 2))
    return out


def lockups(scale: float = 1.0) -> tuple[Image.Image, Image.Image, Image.Image, Image.Image]:
    """(compact light, compact dark, full light, full dark) at the given scale."""
    sym, people, tagline = load_pieces()
    return (
        compose_lockup(sym, people, None, scale=scale),
        compose_lockup(to_dark(sym), to_dark(people), None, scale=scale),
        compose_lockup(sym, people, tagline, scale=scale),
        compose_lockup(to_dark(sym), to_dark(people), to_dark(tagline), scale=scale),
    )
