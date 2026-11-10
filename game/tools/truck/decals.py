"""Livery decal sheets (RGBA) for the truck: door number, bed-side sponsor
panel and roof number. Slightly distressed so they read as worn vinyl."""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(__file__)
FONT = os.path.join(HERE, 'fonts', 'SairaCondensed-Bold.ttf')


def distress(img, seed, amount=0.25):
    rng = np.random.default_rng(seed)
    a = np.asarray(img).astype(np.float32)
    h, w = a.shape[:2]
    n = rng.random((h // 8, w // 8))
    n = np.asarray(Image.fromarray((n * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)) / 255.0
    fine = rng.random((h, w))
    chip = (n * 0.7 + fine * 0.3) < amount
    a[..., 3] *= np.where(chip, 0.0, 1.0)
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def door(number='27', path=None):
    W, H = 1024, 512
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # number plate disc
    d.ellipse((330, 20, 330 + 470, 20 + 470), fill=(236, 232, 222, 255))
    f = ImageFont.truetype(FONT, 400)
    tw = d.textlength(number, font=f)
    d.text((565 - tw / 2, -10), number, font=f, fill=(20, 18, 18, 255))
    # sponsor strip
    f2 = ImageFont.truetype(FONT, 92)
    d.rectangle((0, 400, 300, 500), fill=(20, 18, 18, 255))
    d.text((14, 392), 'ASHFIRE', font=f2, fill=(255, 190, 40, 255))
    im = distress(im, 1, 0.12)
    if path:
        im.save(path)
    return im


def bedside(path=None):
    W, H = 1024, 256
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(FONT, 170)
    d.text((10, 20), 'GRAVEL RIOT', font=f, fill=(238, 234, 224, 255))
    d.rectangle((10, 210, 900, 236), fill=(255, 170, 30, 255))
    im = distress(im, 2, 0.16)
    if path:
        im.save(path)
    return im


def roof(number='27', path=None):
    W, H = 512, 512
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((40, 40, 472, 472), fill=(236, 232, 222, 255))
    f = ImageFont.truetype(FONT, 400)
    tw = d.textlength(number, font=f)
    d.text((256 - tw / 2, 10), number, font=f, fill=(20, 18, 18, 255))
    im = distress(im, 3, 0.1)
    if path:
        im.save(path)
    return im


def make_all(outdir):
    os.makedirs(outdir, exist_ok=True)
    return {
        'door': door(path=os.path.join(outdir, 'decal_door.png')) and os.path.join(outdir, 'decal_door.png'),
        'bed': bedside(path=os.path.join(outdir, 'decal_bed.png')) and os.path.join(outdir, 'decal_bed.png'),
        'roof': roof(path=os.path.join(outdir, 'decal_roof.png')) and os.path.join(outdir, 'decal_roof.png'),
    }
