"""Decal sheets for the vehicle line-up: race number disc, sponsor strip and
number plate. Distressed like the truck's so they read as worn vinyl."""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, '..', 'truck', 'fonts', 'SairaCondensed-Bold.ttf')

import sys
sys.path.insert(0, os.path.join(HERE, '..', 'truck'))
from decals import distress  # noqa: E402


def c8(c):
    """linear float colour -> sRGB 8-bit"""
    out = []
    for v in c:
        v = max(0.0, min(1.0, v))
        s = 12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
        out.append(int(s * 255 + 0.5))
    return tuple(out) + (255,)


def number_disc(number, bg=(236, 232, 222, 255), fg=(20, 18, 18, 255), path=None, seed=1):
    W = 512
    im = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((8, 8, W - 8, W - 8), fill=bg)
    d.ellipse((8, 8, W - 8, W - 8), outline=fg, width=14)
    f = ImageFont.truetype(FONT, 380 if len(number) < 3 else 290)
    tw = d.textlength(number, font=f)
    d.text((W / 2 - tw / 2, W / 2 - (250 if len(number) < 3 else 190)), number, font=f, fill=fg)
    im = distress(im, seed, 0.1)
    if path:
        im.save(path)
    return im


def plate(number, bg, fg, path=None, seed=2):
    """Motocross-style number plate: rounded background with a big number."""
    W, H = 512, 512
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((10, 10, W - 10, H - 10), 70, fill=bg)
    f = ImageFont.truetype(FONT, 400 if len(number) < 3 else 300)
    tw = d.textlength(number, font=f)
    d.text((W / 2 - tw / 2, H / 2 - (265 if len(number) < 3 else 200)), number, font=f, fill=fg)
    im = distress(im, seed, 0.08)
    if path:
        im.save(path)
    return im


def sponsor(text, fg, bar, path=None, seed=3):
    W, H = 1024, 256
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    size = 170
    f = ImageFont.truetype(FONT, size)
    while d.textlength(text, font=f) > W - 30 and size > 60:
        size -= 8
        f = ImageFont.truetype(FONT, size)
    d.text((10, 128 - size * 0.62), text, font=f, fill=fg)
    tw = d.textlength(text, font=f)
    d.rectangle((10, 214, min(W - 10, 10 + tw), 238), fill=bar)
    im = distress(im, seed, 0.14)
    if path:
        im.save(path)
    return im


def make(outdir, spec):
    os.makedirs(outdir, exist_ok=True)
    num = str(spec['number'])
    light = c8(spec.get('num_bg', (0.8, 0.78, 0.72)))
    dark = c8(spec.get('num_fg', (0.01, 0.01, 0.01)))
    accent = c8(spec['c3'])
    p = {
        'disc': os.path.join(outdir, 'decal_disc.png'),
        'plate': os.path.join(outdir, 'decal_plate.png'),
        'sponsor': os.path.join(outdir, 'decal_sponsor.png'),
    }
    number_disc(num, light, dark, p['disc'])
    plate(num, light, dark, p['plate'])
    sponsor(spec.get('sponsor', 'GRAVEL RIOT').upper(), light, accent, p['sponsor'])
    return p
