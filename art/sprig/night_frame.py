"""
Put a transparent Sprig render (sprig3d.py --frame) on a plain night background: a soft dark
green gradient, a faint mint glow behind Sprig and a soft shadow where it stands. Run with
ordinary Python + Pillow:

  python art/sprig/night_frame.py <in.png> <out.png>
"""

import sys

from PIL import Image, ImageDraw, ImageFilter

TOP, BOTTOM = (14, 30, 23), (4, 9, 7)
GLOW = (141, 255, 200)


def night(src, dst):
    sprig = Image.open(src).convert("RGBA")
    w, h = sprig.size
    left, top, right, bottom = sprig.getchannel("A").point(lambda a: 255 if a > 40 else 0).getbbox()
    cx, cy = (left + right) / 2, (top + bottom) / 2

    # Night sky to ground, top to bottom.
    bg = Image.new("RGB", (w, h))
    px = ImageDraw.Draw(bg)
    for y in range(h):
        t = y / (h - 1)
        px.line([(0, y), (w, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM)))
    bg = bg.convert("RGBA")

    # A faint mint glow behind Sprig.
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    r = max(right - left, bottom - top) * 0.75
    ImageDraw.Draw(glow).ellipse([cx - r, cy - r, cx + r, cy + r], fill=GLOW + (34,))
    bg.alpha_composite(glow.filter(ImageFilter.GaussianBlur(r * 0.45)))

    # A soft shadow under its feet (or under the soil, for the seed).
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sw, sh = (right - left) * 0.42, (right - left) * 0.07
    ImageDraw.Draw(shadow).ellipse([cx - sw, bottom - sh, cx + sw, bottom + sh], fill=(0, 0, 0, 170))
    bg.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(sh * 0.9)))

    bg.alpha_composite(sprig)
    bg.convert("RGB").save(dst)


if __name__ == "__main__":
    night(sys.argv[1], sys.argv[2])
