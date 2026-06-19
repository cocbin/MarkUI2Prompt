#!/usr/bin/env python3
"""Compose the two guide images (requirements item 3):

  step4.png  "Capture a screenshot"  — the page with the extension popup docked
             top-right (like a real browser), red box around the *Screenshot* btn.
  step5.png  "Export the prompt"      — only the popup, red boxes around the
             copy / download / full-info (export) buttons.

The popup is screenshotted live from the harness (popup.png, 2x = 968x600 css),
the page is an existing app screenshot; PIL merges them so it reads like a real
in-browser capture, including the popup's window border + shadow.
"""

import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
GUIDE = os.path.join(ROOT, "public", "guide")

POPUP = os.path.join(HERE, "popup.png")           # 968x1200 (2x of 484x600)
PAGE = os.path.join(GUIDE, "step1.png")            # background app screenshot
OUT_SHOT = os.path.join(GUIDE, "step4.png")
OUT_EXPORT = os.path.join(GUIDE, "step5.png")

POPUP_CSS_W = 484.0
POPUP_DPR = 2.0  # popup.png native px per css px
RED = (255, 69, 58)

# Button geometry (css px, relative to the popup's #app top-left).
BTN = {
    "copyPage": (14, 445, 219.5, 30.5),
    "copyAll": (240.5, 445, 219.5, 30.5),
    "downloadPage": (14, 482.5, 219.5, 30.5),
    "downloadAll": (240.5, 482.5, 219.5, 30.5),
    "screenshot": (14, 520, 219.5, 30.5),
    "clearPage": (240.5, 520, 219.5, 30.5),
    "downloadFull": (14, 557.5, 446, 30.5),
}


def load_font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def rounded(img, radius):
    """Return a copy of img with rounded corners (adds alpha)."""
    img = img.convert("RGBA")
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius=radius, fill=255)
    img.putalpha(mask)
    return img


def paste_with_shadow(canvas, popup_rgba, pos, radius, blur=26, shadow_alpha=150, spread=22):
    """Paste a rounded popup with a soft drop shadow onto canvas (RGBA)."""
    px, py = pos
    w, h = popup_rgba.size
    # Shadow layer.
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle(
        [px - 2, py + 4, px + w + 2, py + h + 8], radius=radius + 4, fill=(0, 0, 0, shadow_alpha)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(shadow)
    canvas.paste(popup_rgba, (px, py), popup_rgba)
    # 1px border ring on top (the popup's browser window border).
    border = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(border).rounded_rectangle(
        [px - 1, py - 1, px + w, py + h], radius=radius + 1, outline=(80, 84, 92, 255), width=2
    )
    canvas.alpha_composite(border)


def scaled_popup(disp_w):
    popup = Image.open(POPUP).convert("RGBA")
    scale = disp_w / popup.size[0]
    disp_h = round(popup.size[1] * scale)
    popup = popup.resize((disp_w, disp_h), Image.LANCZOS)
    # css px -> displayed px factor
    css_factor = disp_w / POPUP_CSS_W
    return popup, css_factor


def btn_box(name, css_factor, offset, pad=4):
    x, y, w, h = BTN[name]
    ox, oy = offset
    bx = ox + x * css_factor - pad
    by = oy + y * css_factor - pad
    return [bx, by, bx + w * css_factor + pad * 2, by + h * css_factor + pad * 2]


def union_box(names, css_factor, offset, pad=5):
    boxes = [btn_box(n, css_factor, offset, pad=0) for n in names]
    x0 = min(b[0] for b in boxes) - pad
    y0 = min(b[1] for b in boxes) - pad
    x1 = max(b[2] for b in boxes) + pad
    y1 = max(b[3] for b in boxes) + pad
    return [x0, y0, x1, y1]


def draw_red_box(draw, box, radius=10, width=4):
    draw.rounded_rectangle(box, radius=radius, outline=RED, width=width)


def build_chrome(width, height, url):
    bar = Image.new("RGBA", (width, height), (43, 45, 49, 255))
    d = ImageDraw.Draw(bar)
    d.line([(0, height - 1), (width, height - 1)], fill=(26, 27, 30, 255), width=2)
    cy = height // 2
    for i, color in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
        cx = 22 + i * 22
        d.ellipse([cx - 7, cy - 7, cx + 7, cy + 7], fill=color)
    # address bar
    ax0, ax1 = 104, int(width * 0.60)
    d.rounded_rectangle([ax0, cy - 16, ax1, cy + 16], radius=16, fill=(58, 61, 67, 255))
    font = load_font(20)
    d.text((ax0 + 18, cy - 11), url, font=font, fill=(200, 205, 212, 255))
    # extension icons (right); the last one is the active UI2Prompt icon.
    icons_x = [width - 150, width - 112, width - 74]
    for ix in icons_x:
        d.ellipse([ix - 12, cy - 12, ix + 12, cy + 12], fill=(70, 73, 80, 255))
    ax = width - 32
    d.ellipse([ax - 17, cy - 17, ax + 17, cy + 17], fill=(124, 92, 230, 60))
    d.ellipse([ax - 12, cy - 12, ax + 12, cy + 12], fill=(96, 165, 250, 255))
    d.ellipse([ax - 5, cy - 5, ax + 5, cy + 5], fill=(255, 255, 255, 230))
    return bar


def build_step4():
    page = Image.open(PAGE).convert("RGBA")
    pw, ph = page.size
    chrome_h = 56

    popup_disp_w = int(pw * 0.40)
    popup, css_factor = scaled_popup(popup_disp_w)
    canvas = Image.new("RGBA", (pw, ph + chrome_h), (16, 17, 19, 255))

    # page screenshot under the chrome bar, very slightly dimmed for focus
    dim = Image.new("RGBA", page.size, (0, 0, 0, 40))
    page_dim = Image.alpha_composite(page, dim)
    canvas.paste(page_dim, (0, chrome_h), page_dim)

    chrome = build_chrome(pw, chrome_h, "localhost:5173/#/orch/bigscreen/srv-4/edit")
    canvas.alpha_composite(chrome, (0, 0))

    radius = 12
    popup_round = rounded(popup, radius)
    px = pw - popup_disp_w - 16
    py = chrome_h + 8
    paste_with_shadow(canvas, popup_round, (px, py), radius)

    d = ImageDraw.Draw(canvas)
    draw_red_box(d, btn_box("screenshot", css_factor, (px, py)), radius=9, width=4)

    canvas.convert("RGB").save(OUT_SHOT)
    print("wrote", OUT_SHOT, canvas.size)


def build_step5():
    popup_disp_w = 600
    popup, css_factor = scaled_popup(popup_disp_w)
    pw, phh = popup.size
    pad = 70
    cw, ch = pw + pad * 2, phh + pad * 2

    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 255))
    top, bot = (38, 40, 46), (20, 21, 24)
    for y in range(ch):
        t = y / ch
        r = int(top[0] + (bot[0] - top[0]) * t)
        g = int(top[1] + (bot[1] - top[1]) * t)
        b = int(top[2] + (bot[2] - top[2]) * t)
        ImageDraw.Draw(canvas).line([(0, y), (cw, y)], fill=(r, g, b, 255))

    radius = 14
    popup_round = rounded(popup, radius)
    px, py = pad, pad
    paste_with_shadow(canvas, popup_round, (px, py), radius, blur=30, shadow_alpha=170)

    d = ImageDraw.Draw(canvas)
    # box 1: copy + download grid (rows 1-2)
    draw_red_box(
        d,
        union_box(["copyPage", "copyAll", "downloadPage", "downloadAll"], css_factor, (px, py)),
        radius=12,
        width=4,
    )
    # box 2: full-info (with DOM) button
    draw_red_box(d, btn_box("downloadFull", css_factor, (px, py), pad=5), radius=10, width=4)

    canvas.convert("RGB").save(OUT_EXPORT)
    print("wrote", OUT_EXPORT, canvas.size)


if __name__ == "__main__":
    build_step4()
    build_step5()
