#!/usr/bin/env python3
"""Generate the Webster Free favicon in multiple sizes and formats.

Design: a red rounded square (#b32500) with a white serif "W" centered,
matching the brand identity of the site.
"""

from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

# Brand colors
RED = (179, 37, 0)        # #b32500
RED_DARK = (140, 28, 0)   # subtle bottom-edge shade
WHITE = (255, 255, 255)

OUT_DIR = Path("/home/z/my-project/public")
OUT_DIR.mkdir(parents=True, exist_ok=True)

FONT_PATH = "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"


def render_icon(size: int) -> Image.Image:
    """Render the icon at the given pixel size (square)."""
    # Render at 4x the target size for anti-aliasing, then downsample.
    scale = 4
    big = size * scale
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded-rect background filling the whole canvas.
    # 22% corner radius — modern without going full circle.
    corner = int(big * 0.22)
    draw.rounded_rectangle(
        [(0, 0), (big - 1, big - 1)],
        radius=corner,
        fill=RED,
    )

    # Subtle bottom-edge shading for a tiny bit of depth.
    shade_h = int(big * 0.18)
    overlay = Image.new("RGBA", (big, shade_h), RED_DARK + (90,))
    mask = Image.new("L", (big, shade_h), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [(0, 0), (big - 1, shade_h - 1)],
        radius=corner,
        fill=255,
    )
    img.paste(overlay, (0, big - shade_h), mask)

    # Render the "W" glyph. Font size is ~62% of icon size.
    font_size = int(big * 0.62)
    font = ImageFont.truetype(FONT_PATH, font_size)

    # Measure glyph bounds so we can center precisely.
    bbox = draw.textbbox((0, 0), "W", font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    text_x = (big - text_w) // 2 - bbox[0]
    # Nudge down slightly so the cap-height looks visually centered.
    text_y = (big - text_h) // 2 - bbox[1] + int(big * 0.02)

    # Subtle drop shadow under the W for legibility at small sizes.
    shadow_offset = max(1, int(big * 0.012))
    draw.text(
        (text_x + shadow_offset, text_y + shadow_offset),
        "W",
        font=font,
        fill=(0, 0, 0, 70),
    )
    draw.text((text_x, text_y), "W", font=font, fill=WHITE)

    # Downsample to target size with high-quality LANCZOS filter.
    return img.resize((size, size), Image.LANCZOS)


def main():
    sizes = [16, 32, 48, 64, 128, 256]

    # Save individual PNGs.
    for s in sizes:
        img = render_icon(s)
        img.save(OUT_DIR / f"favicon-{s}.png")
        print(f"  + favicon-{s}.png")

    # Apple Touch Icon (180x180 — iOS home screen icon).
    # Apple wants no transparency; flatten onto white.
    apple = render_icon(180)
    flat = Image.new("RGB", apple.size, (255, 255, 255))
    flat.paste(apple, mask=apple.split()[-1])
    flat.save(OUT_DIR / "apple-touch-icon.png")
    print("  + apple-touch-icon.png")

    # Multi-resolution .ico file.
    ico_imgs = [render_icon(s) for s in sizes]
    ico_imgs[0].save(
        OUT_DIR / "favicon.ico",
        format="ICO",
        sizes=[(s, s) for s in sizes],
        append_images=ico_imgs[1:],
    )
    print(f"  + favicon.ico (multi-resolution: {sizes})")

    # Open Graph icon (1200x630 — social preview card).
    og = Image.new("RGB", (1200, 630), RED)
    draw = ImageDraw.Draw(og)
    font = ImageFont.truetype(FONT_PATH, 460)
    bbox = draw.textbbox((0, 0), "W", font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (1200 - tw) // 2 - bbox[0]
    ty = (630 - th) // 2 - bbox[1]
    draw.text((tx + 4, ty + 4), "W", font=font, fill=(0, 0, 0))
    draw.text((tx, ty), "W", font=font, fill=WHITE)
    og.save(OUT_DIR / "og-image.png")
    print("  + og-image.png (1200x630 social preview)")

    print("\nAll favicon assets written to /home/z/my-project/public/")


if __name__ == "__main__":
    main()
