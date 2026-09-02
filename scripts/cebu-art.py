"""The Cebu art pipeline: the owner's JPG plates and props -> the transparent PNGs the
light theme paints, at the kit's slot canvases. Run from the repo root:

    python scripts/cebu-art.py <folder with the JPGs> public/assets/parallax scripts/cebu-art.json

then encode the .webp beside each PNG with the ffmpeg line in
public/assets/parallax/README.md. Needs Pillow (`python -m pip install pillow`) and
nothing else; it is deliberately not a package.json dependency, for the same reason
scripts/icons.mjs keeps sharp out of the bundle.

Modes, per piece in the JSON:
  key      white-background prop: alpha from distance-to-white, de-matted, fitted onto the canvas
  rowkey   per-row background estimate (a vertical sky gradient), same de-matte; `keep` forces rows opaque
  plate    crop a region of a full-frame scene, scale to `height` of the canvas, mirror-extend to its width, feather edges
  luma     alpha from luminance (glow and haze plates) times an elliptical window
  ellipse  alpha = elliptical window only (a patch of ground that fades out)
"""
import sys, os, json, math
from PIL import Image, ImageChops, ImageFilter, ImageOps, ImageMath

SRC = sys.argv[1]
OUT = sys.argv[2]
SPEC = sys.argv[3]

def lut(lo, hi):
    return [0 if v <= lo else 255 if v >= hi else int(255 * (v - lo) / (hi - lo)) for v in range(256)]

def dematte(rgb, alpha):
    """Un-premultiply a white-composited image: C' = (C - (1-a)*255) / a."""
    r, g, b = rgb.split()
    out = []
    for c in (r, g, b):
        # ImageMath works in int; clamp handled by convert('L')
        e = ImageMath.lambda_eval(
            lambda a: a['convert']((a['c'] * 255 - (255 - a['al']) * 255) / a['max'](a['al'], 1), 'L'),
            c=c, al=alpha)
        out.append(e)
    return Image.merge('RGB', out)

def key_white(im, lo=10, hi=70, blur=0.6, bg=None):
    rgb = im.convert('RGB')
    if bg:
        flat = Image.new('RGB', rgb.size, tuple(bg))
        diff = ImageChops.difference(rgb, flat)
    else:
        diff = ImageChops.invert(rgb)
    r, g, b = diff.split()
    d = ImageChops.lighter(ImageChops.lighter(r, g), b)   # max channel distance from the background
    alpha = d.point(lut(lo, hi))
    if blur:
        alpha = alpha.filter(ImageFilter.GaussianBlur(blur))
    if not bg:
        rgb = dematte(rgb, alpha)
    rgb.putalpha(alpha)
    return rgb

def key_rows(im, lo=14, hi=80, blur=0.6, keep=None):
    rgb = im.convert('RGB')
    w, h = rgb.size
    px = rgb.load()
    bg = Image.new('RGB', (w, h))
    bpx = bg.load()
    for y in range(h):
        row = [px[x, y] for x in range(0, w, 3)]
        med = tuple(sorted(c[i] for c in row)[len(row) // 2] for i in range(3))
        for x in range(w):
            bpx[x, y] = med
    diff = ImageChops.difference(rgb, bg)
    r, g, b = diff.split()
    d = ImageChops.lighter(ImageChops.lighter(r, g), b)
    alpha = d.point(lut(lo, hi))
    if blur:
        alpha = alpha.filter(ImageFilter.GaussianBlur(blur))
    if keep:
        px = alpha.load()
        for (a, b) in keep:
            for y in range(int(h * a), int(h * b)):
                for x in range(w):
                    px[x, y] = 255
    rgb.putalpha(alpha)
    return rgb

def ellipse_window(size, rx=0.5, ry=0.5, power=1.4, inner=0.3):
    """Soft elliptical window 1 at centre -> 0 at the edge."""
    w, h = size
    grad = Image.radial_gradient('L')  # 256x256, 0 at centre -> 255 at radius
    win = grad.resize((int(w / rx * 0.5) or 1, int(h / ry * 0.5) or 1), Image.BILINEAR)
    canvas = Image.new('L', (w, h), 255)
    canvas.paste(win, ((w - win.width) // 2, (h - win.height) // 2))
    inv = ImageChops.invert(canvas)
    # remap: inner% stays fully opaque, then falls with `power`
    table = []
    for v in range(256):
        t = v / 255
        t = 0 if t <= 0 else min(1, (t - inner) / (1 - inner)) if t > inner else 0
        table.append(int(255 * (1 - (1 - t) ** power)) if t > 0 else 0)
    return inv.point(table)

def edge_feather(alpha, top=0.0, bottom=0.0, left=0.0, right=0.0):
    w, h = alpha.size
    if top:
        n = int(h * top)
        for y in range(n):
            k = y / n
            k = k * k * (3 - 2 * k)
            band = alpha.crop((0, y, w, y + 1)).point(lambda v, k=k: int(v * k))
            alpha.paste(band, (0, y))
    if bottom:
        n = int(h * bottom)
        for y in range(n):
            k = y / n
            k = k * k * (3 - 2 * k)
            yy = h - 1 - y
            band = alpha.crop((0, yy, w, yy + 1)).point(lambda v, k=k: int(v * k))
            alpha.paste(band, (0, yy))
    if left or right:
        px = alpha.load()
        nl, nr = int(w * left), int(w * right)
        for x in range(w):
            k = 1.0
            if nl and x < nl:
                t = x / nl; k = min(k, t * t * (3 - 2 * t))
            if nr and x >= w - nr:
                t = (w - 1 - x) / nr; k = min(k, t * t * (3 - 2 * t))
            if k < 1:
                for y in range(h):
                    px[x, y] = int(px[x, y] * k)
    return alpha

def mirror_extend(im, W):
    """Widen to W by mirroring the edges outward."""
    w, h = im.size
    if w >= W:
        x0 = (w - W) // 2
        return im.crop((x0, 0, x0 + W, h))
    out = Image.new('RGBA', (W, h), (0, 0, 0, 0))
    x = (W - w) // 2
    out.paste(im, (x, 0))
    flip = ImageOps.mirror(im)
    # left
    need = x
    while need > 0:
        piece = flip.crop((w - min(need, w), 0, w, h))
        out.paste(piece, (need - piece.width, 0))
        need -= piece.width
        flip = ImageOps.mirror(flip)
    flip = ImageOps.mirror(im)
    xr = x + w
    while xr < W:
        piece = flip.crop((0, 0, min(W - xr, w), h))
        out.paste(piece, (xr, 0))
        xr += piece.width
        flip = ImageOps.mirror(flip)
    return out

def fit_onto(cut, canvas, scale=None, width=None, height=None, anchor='bottom', dx=0, dy=0, flip=False, extend=False):
    """Trim to alpha bbox, scale to `width`/`height` (fraction of canvas) or `scale`, place with anchor."""
    W, H = canvas
    bbox = cut.getbbox()
    cut = cut.crop(bbox) if bbox else cut
    if flip:
        cut = ImageOps.mirror(cut)
    cw, ch = cut.size
    if width:
        s = (W * width) / cw
    elif height:
        s = (H * height) / ch
    else:
        s = scale or min(W / cw, H / ch)
    cut = cut.resize((max(1, int(cw * s)), max(1, int(ch * s))), Image.LANCZOS)
    if extend:
        band = mirror_extend(cut, W)
        out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        out.paste(band, (0, H - band.height + int(dy * H)), band)
        return out
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    x = (W - cut.width) // 2 + int(dx * W)
    if anchor == 'bottom':
        y = H - cut.height + int(dy * H)
    elif anchor == 'top':
        y = int(dy * H)
    else:
        y = (H - cut.height) // 2 + int(dy * H)
    out.paste(cut, (x, y), cut)
    return out

def crop_frac(im, box):
    w, h = im.size
    return im.crop((int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h)))

spec = json.load(open(SPEC))
for name, s in spec.items():
    src = Image.open(os.path.join(SRC, s['src']))
    W, H = s['canvas']
    mode = s['mode']
    if mode == 'key':
        cut = key_white(src, **s.get('key', {}))
        if 'crop' in s:
            cut = crop_frac(cut, s['crop'])
        out = fit_onto(cut, (W, H), **s.get('fit', {}))
    elif mode == 'rowkey':
        cut = key_rows(src, **s.get('key', {}))
        if 'crop' in s:
            cut = crop_frac(cut, s['crop'])
        out = fit_onto(cut, (W, H), **s.get('fit', {}))
    elif mode in ('plate', 'luma', 'ellipse'):
        im = src.convert('RGBA')
        if 'crop' in s:
            im = crop_frac(im, s['crop'])
        # scale to canvas height (or a fraction of it, bottom-anchored), then mirror-extend to the width
        hf = s.get('height', 1.0)
        th = int(H * hf)
        sc = th / im.height
        im = im.resize((int(im.width * sc), th), Image.LANCZOS)
        im = mirror_extend(im, W)
        if th < H:
            pad = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            pad.paste(im, (0, H - th))
            im = pad
        alpha = Image.new('L', (W, H), 255)
        if th < H:
            alpha = Image.new('L', (W, H), 0)
            alpha.paste(255, (0, H - th, W, H))
        if mode == 'luma':
            l = im.convert('L')
            p = s.get('luma', {})
            alpha = l.point(lut(p.get('lo', 60), p.get('hi', 235)))
        if s.get('window'):
            alpha = ImageChops.multiply(alpha, ellipse_window((W, H), **s['window']))
        f = s.get('feather', {})
        if f:
            alpha = edge_feather(alpha, **f)
        im.putalpha(alpha)
        out = im
    else:
        raise SystemExit('unknown mode ' + mode)
    path = os.path.join(OUT, s['out'])
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out.save(path, optimize=True)
    bb = out.getbbox()
    print(f"{name:22s} -> {s['out']}  {W}x{H}  ink bbox={bb}")
