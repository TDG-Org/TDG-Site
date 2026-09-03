"""The Cebu art pipeline: the owner's JPG plates and props -> the transparent PNGs the
light theme paints, at the kit's slot canvases. Run from the repo root:

    python scripts/cebu-art.py <folder with the JPGs> public/assets/parallax scripts/cebu-art.json

then encode the .webp beside each PNG with the ffmpeg line in
public/assets/parallax/README.md. Needs Pillow (`python -m pip install pillow`) and
nothing else; it is deliberately not a package.json dependency, for the same reason
scripts/icons.mjs keeps sharp out of the bundle.

Modes, per piece in the JSON:
  alpha    the source PNG ALREADY carries its alpha -> trim to the ink and fit onto the canvas
  chroma   flat single-colour backdrop (the owner's magenta plates) -> keyed on distance to that colour
  plate    crop a region of a full-frame scene, scale to `height` of the canvas, mirror-extend to its width, feather edges
  skyline  a plate whose alpha follows the plate's OWN horizon -- sky cut away, ground solid
  luma     alpha from luminance (glow and haze plates) times an elliptical window
  ellipse  alpha = elliptical window only (a patch of ground that fades out)

── why there is no white-key mode any more ─────────────────────────────────
There were two, `key` (distance to white) and `rowkey` (distance to a per-row
median), and they are the single cause of most of what the light theme got
wrong. Alpha from distance-to-white is zero exactly where the subject IS white:
a cumulus cloud keyed against a white sky came out at alpha 0.05 and painted as
a grey ghost, shore foam vanished, the palms lost their pale trunks and kept a
rind of speckle where the anti-aliased edge fell between the two thresholds.
No pair of `lo`/`hi` fixes that, because the information is not in the file.

The owner then supplied the same art as PNGs with real alpha, so the cut is no
longer this script's job for those pieces -- `alpha` trims and places, and does
not touch a single pixel's colour or opacity. Do not reintroduce a white keyer.
If a new plate arrives on a flat backdrop, it comes on MAGENTA and goes through
`chroma`, which keys on distance to a colour the subject does not contain.
"""
import sys, os, json, math
from PIL import Image, ImageChops, ImageFilter, ImageOps, ImageMath

SRC = sys.argv[1]
OUT = sys.argv[2]
SPEC = sys.argv[3]

def lut(lo, hi):
    return [0 if v <= lo else 255 if v >= hi else int(255 * (v - lo) / (hi - lo)) for v in range(256)]

def load_alpha(im):
    """The file already carries its alpha. Return it untouched.

    Deliberately not one line of colour or opacity maths: the owner's cutouts
    are the artwork, and every pixel this script would "improve" is a pixel the
    illustrator already decided. The old keyers are what this replaces."""
    return im.convert('RGBA')


def corner_colour(rgb, pad=3):
    """The backdrop colour, read off the plate rather than assumed.

    `bg=(255, 0, 255)` was assumed once and it cost a render: the owner's
    plates are a hot pink around (253, 1, 183), which is 72 away from pure
    magenta on blue alone — inside the key's own `hi`, so the backdrop came out
    at alpha 116 and the boat shipped inside a translucent pink rectangle. The
    four corners of a keyed plate are backdrop by construction, so read them."""
    w, h = rgb.size
    pts = [(pad, pad), (w - 1 - pad, pad), (pad, h - 1 - pad), (w - 1 - pad, h - 1 - pad)]
    cols = [rgb.getpixel(p) for p in pts]
    return tuple(sorted(c[i] for c in cols)[len(cols) // 2] for i in range(3))


def key_chroma(im, bg=None, lo=40, hi=110, blur=0.8, spill=55, erode=1):
    """Key a flat backdrop the subject does not contain (the owner's magenta).

    `bg` defaults to whatever the plate's own corners are — see
    `corner_colour`. Pass one explicitly only to override that.

    Distance to the backdrop colour, not to white, so a white subject on it is
    at maximum distance rather than at zero -- which is the whole reason this
    mode exists.

    `erode` shrinks the matte by one pixel before the blur, and `spill` (an
    integer PERCENTAGE, because ImageMath multiplies an image by an int and
    raises `color must be int` on a float) walks the remaining rim's colour
    away from the backdrop. Both are for the same artefact: a JPEG's own
    chroma subsampling smears magenta a pixel or two into every edge, and
    without them the boat keeps a violet fringe that is very visible against a
    blue sea."""
    rgb = im.convert('RGB')
    bg = tuple(bg) if bg else corner_colour(rgb)
    flat = Image.new('RGB', rgb.size, bg)
    r, g, b = ImageChops.difference(rgb, flat).split()
    d = ImageChops.lighter(ImageChops.lighter(r, g), b)
    alpha = d.point(lut(lo, hi))
    for _ in range(int(erode)):
        alpha = alpha.filter(ImageFilter.MinFilter(3))
    if blur:
        alpha = alpha.filter(ImageFilter.GaussianBlur(blur))
    if spill:
        # c' = c + (c - k) * (1 - a) * s, in clamped 8-bit ImageChops only.
        # ImageMath's _Operand has neither float `*` nor `//`, so the obvious
        # one-liner raises; `multiply` IS (x * y) / 255, which is the (1 - a)
        # and the s/100 weightings for free.
        inv = ImageChops.invert(alpha)
        wt = ImageChops.multiply(inv, Image.new('L', rgb.size, int(255 * spill / 100)))
        chans = []
        for c, bgc in zip(rgb.split(), bg):
            k = Image.new('L', rgb.size, int(bgc))
            up = ImageChops.multiply(ImageChops.subtract(c, k), wt)
            dn = ImageChops.multiply(ImageChops.subtract(k, c), wt)
            chans.append(ImageChops.subtract(ImageChops.add(c, up), dn))
        rgb = Image.merge('RGB', chans)
    rgb.putalpha(alpha)
    return rgb


def skyline_alpha(rgb, valid=None, feather=6, lift=0.0):
    """Alpha that follows the plate's own horizon: sky transparent, ground solid.

    A `plate` is a rectangle, and a rectangle laid across a section is a ruled
    line — which is exactly what the first sand bank did: `sand-bank-2.jpg`
    cropped below its sky gave a hard, perfectly horizontal top edge that
    buried the palm row behind it and read as a sheet of paper. The winter
    piece it stands in for (`landscapes/snow-bank-dark`) is a DRIFT: a curved
    crest with the trees behind it showing over the top.

    The plate already contains that curve — it is the dune's own ridge against
    the sky. So instead of cutting the sky off with a straight line, walk down
    each column until the pixel stops being sky (blue-dominant) and start the
    alpha there. `lift` raises the found line by a fraction of the height, so
    the crest keeps a little of its own rim rather than starting at the first
    grain of sand; `feather` is the blur that turns the per-column step into an
    edge that can be composited.

    `valid` is the alpha the plate already has, and the scan MUST start below
    it: the canvas is padded with transparent black above a plate shorter than
    the canvas, (0, 0, 0) is not blue, so a scan that starts at row 0 finds its
    crest in the padding in every column and the mask comes out solid. That is
    not hypothetical — it is what the first run of this printed."""
    w, h = rgb.size
    px = rgb.load()
    vpx = valid.load() if valid is not None else None
    limit = int(h * 0.7)
    cuts = []
    for x in range(w):
        y0 = 0
        if vpx is not None:
            while y0 < h and vpx[x, y0] == 0:
                y0 += 1
        # the LAST sky row, not the first non-sky one: a sunbeam crossing the
        # sky is warm, so "first non-sky" stops on the beam and leaves a
        # column of sky hanging below the crest. Three of those shipped in the
        # first sand bank and read as blue splinters standing on the dune.
        cut = y0
        for y in range(y0, min(limit, h)):
            r, g, b = px[x, y][:3]
            if b > r + 18:
                cut = y + 1
        cuts.append(max(y0, int(cut - h * lift)))
    # A median across a window of columns: the dune's own wave is hundreds of
    # columns long and survives it, a one-column misread does not.
    k = max(1, (w // 120) | 1)
    sm = []
    for x in range(w):
        a = max(0, x - k // 2)
        sm.append(sorted(cuts[a:a + k])[min(k, len(cuts) - a) // 2])
    mask = Image.new('L', (w, h), 0)
    mpx = mask.load()
    for x in range(w):
        for y in range(sm[x], h):
            mpx[x, y] = 255
    return mask.filter(ImageFilter.GaussianBlur(feather))


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
    if mode in ('alpha', 'chroma'):
        cut = load_alpha(src) if mode == 'alpha' else key_chroma(src, **s.get('key', {}))
        if 'crop' in s:
            cut = crop_frac(cut, s['crop'])
        out = fit_onto(cut, (W, H), **s.get('fit', {}))
    elif mode in ('plate', 'luma', 'ellipse', 'skyline'):
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
        if mode == 'skyline':
            alpha = ImageChops.multiply(
                alpha, skyline_alpha(im.convert('RGB'), valid=alpha, **s.get('skyline', {})))
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
