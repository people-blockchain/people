#!/usr/bin/env python3
"""Generate the site + app brand assets from the approved PEOPLE logo PNG.

Writes `public/brand/` and `public/favicon.ico`. See `brand_assets.py` for the
drawing rules — this file only picks sizes and filenames.

Run from the `website/` directory:

    python3 scripts/generate-brand-assets.py
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys

import brand_assets as B
from PIL import Image


def save(img: Image.Image, name: str) -> str:
    path = os.path.join(B.OUT, name)
    img.save(path, "PNG", optimize=True)
    return path


def main() -> int:
    if not os.path.exists(B.SRC):
        print(f"approved artwork not found: {B.SRC}", file=sys.stderr)
        return 1
    os.makedirs(B.OUT, exist_ok=True)

    logical = {}
    for factor in B.SCALES:
        suffix = "" if factor == 1 else f"-{factor}x"
        compact_l, compact_d, full_l, full_d = B.lockups(scale=factor)
        if factor == 1:
            logical = {
                "people-lockup": compact_l.size,
                "people-lockup-full": full_l.size,
            }
        # `people-lockup-*`      symbol + PEOPLE          (site header)
        # `people-lockup-full-*` symbol + PEOPLE + tagline (footer, social cards)
        save(compact_l, f"people-lockup-light{suffix}.png")
        save(compact_d, f"people-lockup-dark{suffix}.png")
        save(full_l, f"people-lockup-full-light{suffix}.png")
        save(full_d, f"people-lockup-full-dark{suffix}.png")

    sym, people, tagline = B.load_pieces()
    mark = B.square_mark(sym)
    for size in B.ICON_SIZES:
        save(B.scale_to(mark, size / mark.width), f"icon-{size}.png")

    # Apple touch icons must not rely on transparency: iOS renders it black.
    apple = Image.new("RGBA", (180, 180), (7, 9, 14, 255))  # --c-canvas (dark)
    apple.alpha_composite(B.scale_to(mark, 180 / mark.width), (0, 0))
    save(apple, "apple-touch-icon.png")

    # Multi-resolution .ico served from the site root.
    ico = os.path.join(B.ROOT, "public", "favicon.ico")
    subprocess.run(
        ["magick", *(os.path.join(B.OUT, f"icon-{s}.png") for s in (16, 32, 48)), ico],
        check=True,
    )

    app_dir = os.path.join(B.ROOT, "src", "app")
    os.makedirs(app_dir, exist_ok=True)

    shutil.copy2(ico, os.path.join(app_dir, "favicon.ico"))
    shutil.copy2(os.path.join(B.OUT, "icon-512.png"), os.path.join(app_dir, "icon.png"))
    shutil.copy2(os.path.join(B.OUT, "apple-touch-icon.png"), os.path.join(app_dir, "apple-icon.png"))

    for name, (w, h) in logical.items():
        print(f"{name}: logical {w}x{h}")
    for factor in B.SCALES:
        suffix = "" if factor == 1 else f"-{factor}x"
        for family in ("people-lockup", "people-lockup-full"):
            with Image.open(os.path.join(B.OUT, f"{family}-light{suffix}.png")) as f:
                print(f"  {family}-light{suffix}.png {f.width}x{f.height}")
    print(f"  icon-{B.ICON_SIZES[-1]}.png + apple-touch-icon.png (square symbol, no text)")
    print(f"wrote {B.OUT}, {ico}, and src/app/{{favicon.ico,icon.png,apple-icon.png}}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
