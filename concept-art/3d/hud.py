"""Colour-grade the raw renders and draw the in-game HUD on top.

Usage: python hud.py RAW_DIR OUT_DIR [ids] [--clean]
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageEnhance, ImageChops
import gr3d as G
from shots import SHOTS

HERE = os.path.dirname(os.path.abspath(__file__))
FB = os.path.join(HERE, 'fonts', 'SairaCondensed-Bold.ttf')
FS = os.path.join(HERE, 'fonts', 'SairaCondensed-SemiBold.ttf')
AMBER = (242, 178, 48)
WHITE = (246, 242, 234)
INK = (12, 12, 14)


def font(path, size):
    return ImageFont.truetype(path, size)


def grade(im):
    w, h = im.size
    im = ImageEnhance.Contrast(im).enhance(1.06)
    im = ImageEnhance.Color(im).enhance(1.1)
    # bloom: blur the brightest parts and screen them back
    lum = im.convert('L').point(lambda v: max(0, v - 200) * 4)
    glow = Image.composite(im, Image.new('RGB', im.size), lum).filter(ImageFilter.GaussianBlur(w / 90))
    im = ImageChops.screen(im, glow.point(lambda v: int(v * 0.55)))
    # vignette
    vg = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(vg)
    for i in range(30):
        t = i / 30
        d.ellipse([-w * 0.25 + t * w * 0.2, -h * 0.35 + t * h * 0.2, w * 1.25 - t * w * 0.2, h * 1.35 - t * h * 0.2], fill=int(t * 255))
    vg = vg.filter(ImageFilter.GaussianBlur(w / 20))
    dark = ImageEnhance.Brightness(im).enhance(0.72)
    return Image.composite(im, dark, vg)


def panel(d, box, r, alpha=150):
    d.rounded_rectangle(box, r, fill=(10, 10, 12, alpha))


def text(d, xy, s, f, fill=WHITE, anchor='la', shadow=True):
    if shadow:
        d.text((xy[0] + 2, xy[1] + 2), s, font=f, fill=(0, 0, 0, 150), anchor=anchor)
    d.text(xy, s, font=f, fill=fill, anchor=anchor)


def minimap(d, cfg, box, S):
    """Closed lap layout seeded from the shot, with the field as dots."""
    x0, y0, x1, y1 = box
    k = sum(map(ord, cfg['title']))
    a, b, c = k % 7, (k // 7) % 5, (k // 35) % 3
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    R = (x1 - x0) / 2 - 26 * S

    def pt(t):
        r = 1 + 0.22 * math.sin(2 * t + a) + 0.14 * math.sin(3 * t + b) + 0.07 * math.sin(5 * t + c)
        return (cx + math.cos(t) * R * r / 1.2, cy + math.sin(t) * R * r / 1.2 * 0.85)
    pts = [pt(i / 160 * math.tau) for i in range(161)]
    d.line(pts, fill=(0, 0, 0, 150), width=int(10 * S), joint='curve')
    d.line(pts, fill=(230, 226, 216, 235), width=int(5 * S), joint='curve')
    sp = pt(0.0)
    d.line([(sp[0] - 9 * S, sp[1]), (sp[0] + 9 * S, sp[1])], fill=AMBER + (255,), width=int(4 * S))
    n = cfg.get('hud', {}).get('of', 8)
    me = 1.3 + (k % 10) / 10
    pos = cfg.get('hud', {}).get('pos', 1)
    for i in range(n):
        t = me + (pos - 1 - i) * 0.17 + (0.03 if i % 2 else 0)
        if i == pos - 1:
            continue
        p = pt(t)
        r = 5 * S
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=(220, 70, 50), outline=INK, width=int(2 * S))
    p = pt(me)
    r = 8 * S
    d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=AMBER, outline=INK, width=int(2 * S))


def hud(im, cfg):
    w, h = im.size
    S = w / 1920
    ov = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    H = cfg.get('hud', {})
    m = int(44 * S)
    if H.get('start'):
        text(d, (w / 2, h * 0.27), '3', font(FB, int(230 * S)), fill=AMBER, anchor='mm')
        text(d, (w / 2, h * 0.27 + 130 * S), 'GET READY', font(FS, int(46 * S)), anchor='mm')
        panel(d, (m, m, m + 420 * S, m + 112 * S), int(10 * S))
        text(d, (m + 24 * S, m + 14 * S), 'EVENT 4 · MIXED CLASS', font(FS, int(28 * S)), fill=AMBER)
        text(d, (m + 24 * S, m + 48 * S), cfg['title'].upper(), font(FB, int(46 * S)))
        ov = ov
        return Image.alpha_composite(im.convert('RGBA'), ov).convert('RGB')
    # position + lap
    panel(d, (m, m, m + 300 * S, m + 150 * S), int(10 * S))
    text(d, (m + 22 * S, m + 4 * S), str(H.get('pos', 1)), font(FB, int(108 * S)), fill=AMBER)
    pw = d.textlength(str(H.get('pos', 1)), font=font(FB, int(108 * S)))
    text(d, (m + 30 * S + pw, m + 34 * S), '/%d' % H.get('of', 8), font(FB, int(50 * S)))
    lap = H.get('lap', (1, 3))
    text(d, (m + 30 * S + pw, m + 88 * S), 'LAP %d/%d' % lap, font(FS, int(32 * S)))
    # timer
    t = 61.0 + sum(map(ord, cfg['title'])) % 90 + (sum(map(ord, cfg['title'][::-1])) % 100) / 100
    tf = font(FB, int(44 * S))
    panel(d, (w / 2 - 130 * S, m, w / 2 + 130 * S, m + 64 * S), int(10 * S))
    text(d, (w / 2, m + 32 * S), '%d:%05.2f' % (int(t // 60), t % 60), tf, anchor='mm')
    # minimap
    mm = (w - m - 250 * S, m, w - m, m + 250 * S)
    panel(d, mm, int(14 * S), 130)
    minimap(d, cfg, mm, S)
    # speedo
    cx, cy, r = w - m - 150 * S, h - m - 140 * S, 125 * S
    kmh = H.get('kmh', 120)
    d.arc([cx - r, cy - r, cx + r, cy + r], 135, 405, fill=(0, 0, 0, 150), width=int(18 * S))
    d.arc([cx - r, cy - r, cx + r, cy + r], 135, 135 + 270 * min(1, kmh / 220), fill=AMBER + (255,), width=int(12 * S))
    for k in range(12):
        a = math.radians(135 + 270 * k / 11)
        d.line([(cx + math.cos(a) * (r - 26 * S), cy + math.sin(a) * (r - 26 * S)), (cx + math.cos(a) * (r - 16 * S), cy + math.sin(a) * (r - 16 * S))], fill=WHITE + (200,), width=int(3 * S))
    text(d, (cx, cy - 6 * S), str(kmh), font(FB, int(96 * S)), anchor='mm')
    text(d, (cx, cy + 56 * S), 'KM/H', font(FS, int(28 * S)), anchor='mm')
    # boost meter
    bx, by = m, h - m - 70 * S
    text(d, (bx, by - 44 * S), 'BOOST', font(FS, int(30 * S)))
    segs = 16
    b = H.get('boost', 0.5)
    for k in range(segs):
        x = bx + k * 24 * S
        on = k / segs < b
        hot = k / segs > 0.75
        col = ((235, 80, 40, 240) if hot else AMBER + (240,)) if on else (0, 0, 0, 130)
        d.polygon([(x, by + 40 * S), (x + 10 * S, by), (x + 30 * S, by), (x + 20 * S, by + 40 * S)], fill=col)
    if b > 0.75:
        text(d, (bx + segs * 24 * S + 20 * S, by + 2 * S), 'ENGINE HOT', font(FS, int(26 * S)), fill=(255, 110, 70))
    return Image.alpha_composite(im.convert('RGBA'), ov).convert('RGB')


def main():
    raw, out = sys.argv[1], sys.argv[2]
    ids = sys.argv[3].split(',') if len(sys.argv) > 3 and not sys.argv[3].startswith('--') else sorted(k for k in SHOTS if k != 'test')
    clean = '--clean' in sys.argv
    os.makedirs(out, exist_ok=True)
    for sid in ids:
        p = os.path.join(raw, sid + '.png')
        if not os.path.exists(p):
            continue
        im = grade(Image.open(p).convert('RGB'))
        if not clean:
            im = hud(im, SHOTS[sid])
        slug = SHOTS[sid]['title'].lower().replace(' ', '-')
        im.save(os.path.join(out, '%s-%s.jpg' % (sid, slug)), quality=90)


if __name__ == '__main__':
    main()
