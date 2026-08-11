/**
 * The twelve forms the hero point cloud morphs between.
 *
 * Each form is a weighted set of sampler functions. A sampler emits one random
 * point inside a primitive — a box, a shell, a cylinder, an arc, a line
 * segment, a cone, a quadratic bézier, a polygon edge or fill. `sample` hands
 * each part its share of the point budget, so every form ends up with exactly
 * the same point count and morphing is a straight point-for-point lerp.
 */

export type Point = [number, number, number]
type Sampler = () => Point
type Part = { w?: number; f: Sampler }
export type Shape = { name: string; pts: Float32Array }

const R = (a: number, b: number) => a + Math.random() * (b - a)
const TAU = Math.PI * 2

const box =
  (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): Sampler =>
  () => [cx + R(-sx, sx), cy + R(-sy, sy), cz + R(-sz, sz)]

const shell =
  (cx: number, cy: number, cz: number, r: number, flat = 1): Sampler =>
  () => {
    const u = Math.random() * 2 - 1
    const th = Math.random() * TAU
    const s = Math.sqrt(1 - u * u)
    return [cx + r * s * Math.cos(th), cy + r * u * flat, cz + r * s * Math.sin(th)]
  }

const tube =
  (cx: number, cy: number, cz: number, r: number, len: number, axis: 'x' | 'y'): Sampler =>
  () => {
    const th = Math.random() * TAU
    const l = R(-len, len)
    const rr = r * (0.82 + Math.random() * 0.18)
    if (axis === 'y') return [cx + rr * Math.cos(th), cy + l, cz + rr * Math.sin(th)]
    return [cx + l, cy + rr * Math.cos(th), cz + rr * Math.sin(th)]
  }

/** line segment — for drawing glyphs and outlines out of points */
const seg =
  (x1: number, y1: number, x2: number, y2: number, z = 0, jitter = 0.035): Sampler =>
  () => {
    const t = Math.random()
    return [
      x1 + (x2 - x1) * t + R(-jitter, jitter),
      y1 + (y2 - y1) * t + R(-jitter, jitter),
      z + R(-jitter, jitter),
    ]
  }

const ringXY =
  (cx: number, cy: number, cz: number, rx: number, ry: number, a0 = 0, a1 = TAU): Sampler =>
  () => {
    const th = a0 + Math.random() * (a1 - a0)
    return [
      cx + Math.cos(th) * rx + R(-0.03, 0.03),
      cy + Math.sin(th) * ry + R(-0.03, 0.03),
      cz + R(-0.04, 0.04),
    ]
  }

/** an open book: two fanned page-blocks meeting at the spine */
const page =
  (dir: number, lift = 0): Sampler =>
  () => {
    const u = Math.random()
    const v = Math.random()
    return [
      dir * (0.12 + u * 1.42),
      -0.04 + u * 0.3 + lift + R(-0.035, 0.035),
      (v * 2 - 1) * (1.06 - u * 0.12),
    ]
  }

const cyl =
  (cx: number, cy: number, cz: number, r: number, len: number, axis: 'x' | 'y' | 'z'): Sampler =>
  () => {
    const th = Math.random() * TAU
    const rr = r * Math.sqrt(Math.random())
    const l = R(-len, len)
    if (axis === 'x') return [cx + l, cy + Math.cos(th) * rr, cz + Math.sin(th) * rr]
    if (axis === 'y') return [cx + Math.cos(th) * rr, cy + l, cz + Math.sin(th) * rr]
    return [cx + Math.cos(th) * rr, cy + Math.sin(th) * rr, cz + l]
  }

const arcT =
  (cx: number, cy: number, r0: number, r1: number, a0: number, a1: number, zs: number): Sampler =>
  () => {
    const th = a0 + Math.random() * (a1 - a0)
    const rr = R(r0, r1)
    return [cx + Math.cos(th) * rr, cy + Math.sin(th) * rr, R(-zs, zs)]
  }

const cone =
  (cx: number, cy: number, cz: number, r: number, h: number): Sampler =>
  () => {
    const t = Math.random()
    const th = Math.random() * TAU
    const rr = r * (1 - t) * (0.86 + Math.random() * 0.14)
    return [cx + Math.cos(th) * rr, cy + t * h, cz + Math.sin(th) * rr]
  }

const curve =
  (p0: [number, number], p1: [number, number], p2: [number, number], j: number): Sampler =>
  () => {
    const t = Math.random()
    const u = 1 - t
    return [
      u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0] + R(-j, j),
      u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1] + R(-j, j),
      R(-j, j),
    ]
  }

/** rotate a whole form in place (x then y) */
function rot(a: Float32Array, ax: number, ay: number) {
  const ca = Math.cos(ax)
  const sa = Math.sin(ax)
  const cb = Math.cos(ay)
  const sb = Math.sin(ay)
  for (let k = 0; k < a.length; k += 3) {
    const x = a[k]
    const y = a[k + 1]
    const z = a[k + 2]
    const y2 = y * ca - z * sa
    const z2 = y * sa + z * ca
    a[k] = x * cb + z2 * sb
    a[k + 1] = y2
    a[k + 2] = -x * sb + z2 * cb
  }
  return a
}

// ── globe: coarse land masses as lat/lon blobs, projected onto the sphere ──
const LAND: [number, number, number, number][] = [
  [54, -102, 11, 24], [40, -98, 9, 18], [31, -88, 7, 10], [24, -103, 5, 8], [16, -91, 3, 5],
  [64, -148, 6, 14], [60, -105, 6, 20], [72, -42, 8, 15], [10, -73, 6, 6], [-6, -60, 14, 14],
  [-22, -48, 9, 9], [-34, -63, 8, 5], [-46, -70, 4, 3], [30, 4, 7, 12], [20, 12, 10, 18],
  [4, 20, 12, 14], [-16, 24, 8, 9], [-28, 25, 6, 7], [-20, 46, 4, 2], [47, 10, 7, 16],
  [55, -2, 4, 4], [62, 20, 7, 10], [62, 80, 10, 34], [48, 95, 10, 22], [34, 110, 9, 15],
  [24, 80, 9, 8], [14, 102, 8, 8], [36, 138, 5, 4], [-24, 134, 10, 17], [-40, 173, 4, 3],
  [40, 45, 6, 10], [26, 45, 6, 8],
]
let landAcc = 0
const LAND_W = LAND.map((b) => (landAcc += b[2] * b[3]))
const LAND_TOTAL = landAcc

const geoP = (lat: number, lon: number, r: number): Point => {
  const a = (lat * Math.PI) / 180
  const b = (lon * Math.PI) / 180
  const c = Math.cos(a)
  return [r * c * Math.sin(b), r * Math.sin(a), r * c * Math.cos(b)]
}

const land: Sampler = () => {
  const q = Math.random() * LAND_TOTAL
  let i = 0
  while (i < LAND_W.length - 1 && q > LAND_W[i]) i++
  const b = LAND[i]
  const th = Math.random() * TAU
  const rr = Math.sqrt(Math.random())
  return geoP(b[0] + b[2] * rr * Math.sin(th), b[1] + b[3] * rr * Math.cos(th), 1.53)
}

const ringAt =
  (lat: number, r: number): Sampler =>
  () => {
    const th = Math.random() * TAU
    const c = Math.cos((lat * Math.PI) / 180)
    return [
      r * c * Math.cos(th),
      r * Math.sin((lat * Math.PI) / 180) + R(-0.012, 0.012),
      r * c * Math.sin(th),
    ]
  }

// ── gamepad: half an outline, mirrored → crisp silhouette + interior fill ──
const PAD_HALF: [number, number][] = [
  [0, 0.5], [0.3, 0.48], [0.52, 0.42], [0.72, 0.45], [0.92, 0.4], [1.06, 0.24], [1.1, 0.02],
  [1.22, -0.28], [1.34, -0.62], [1.36, -0.92], [1.24, -1.16], [1.02, -1.24], [0.84, -1.1],
  [0.72, -0.82], [0.58, -0.56], [0.4, -0.44], [0.16, -0.42],
]
const PAD: [number, number][] = PAD_HALF.concat(
  PAD_HALF.slice()
    .reverse()
    .slice(0, PAD_HALF.length - 1)
    .map((p) => [-p[0], p[1]] as [number, number]),
)
const PAD_SEGS: [[number, number], [number, number], number][] = []
let padLen = 0
for (let i = 0; i < PAD.length; i++) {
  const a = PAD[i]
  const b = PAD[(i + 1) % PAD.length]
  padLen += Math.hypot(b[0] - a[0], b[1] - a[1])
  PAD_SEGS.push([a, b, padLen])
}

const padEdge: Sampler = () => {
  const q = Math.random() * padLen
  let i = 0
  while (i < PAD_SEGS.length - 1 && q > PAD_SEGS[i][2]) i++
  const [a, b, acc] = PAD_SEGS[i]
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  const t = 1 - (acc - q) / L
  return [
    a[0] + (b[0] - a[0]) * t + R(-0.018, 0.018),
    a[1] + (b[1] - a[1]) * t + R(-0.018, 0.018),
    R(-0.18, 0.18),
  ]
}

const inPad = (x: number, y: number) => {
  let inside = false
  for (let i = 0, j = PAD.length - 1; i < PAD.length; j = i++) {
    const [xi, yi] = PAD[i]
    const [xj, yj] = PAD[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const padFill: Sampler = () => {
  for (let k = 0; k < 26; k++) {
    const x = R(-1.4, 1.4)
    const y = R(-1.26, 0.52)
    if (inPad(x, y)) return [x, y, R(-0.16, 0.16) * (1 - Math.abs(x) * 0.28)]
  }
  return [0, 0.05, 0]
}

/** Hand each part its share of the budget so every form has the same count. */
function sample(n: number, parts: Part[]): Float32Array {
  const total = parts.reduce((a, p) => a + (p.w ?? 1), 0)
  const out = new Float32Array(n * 3)
  let k = 0
  parts.forEach((p, i) => {
    const count = i === parts.length - 1 ? n - k : Math.round((n * (p.w ?? 1)) / total)
    for (let j = 0; j < count && k < n; j++, k++) {
      const v = p.f()
      out[k * 3] = v[0]
      out[k * 3 + 1] = v[1]
      out[k * 3 + 2] = v[2]
    }
  })
  return out
}

export function buildShapes(n: number): Shape[] {
  return [
    {
      name: 'Jesus',
      pts: sample(n, [
        { w: 3, f: box(0, 0.15, 0, 0.17, 1.55, 0.17) },
        { w: 1.6, f: box(0, 0.72, 0, 0.86, 0.17, 0.17) },
      ]),
    },
    {
      name: 'Where it started',
      pts: sample(n, [
        { w: 1.7, f: arcT(0, 0.02, 1.16, 1.32, 0.3, Math.PI - 0.3, 0.2) },
        { w: 0.5, f: arcT(0, 0.02, 1.02, 1.1, 0.72, Math.PI - 0.72, 0.12) },
        { w: 1.15, f: cyl(-1.2, -0.26, 0, 0.5, 0.2, 'x') },
        { w: 1.15, f: cyl(1.2, -0.26, 0, 0.5, 0.2, 'x') },
        { w: 0.4, f: cyl(-1.42, -0.26, 0, 0.52, 0.03, 'x') },
        { w: 0.4, f: cyl(1.42, -0.26, 0, 0.52, 0.03, 'x') },
        { w: 0.55, f: curve([-1.3, -0.62], [-1.26, -1.3], [-0.5, -1.12], 0.035) },
        { w: 0.3, f: shell(-0.44, -1.1, 0, 0.14) },
      ]),
    },
    {
      name: 'Still gamers',
      pts: sample(n, [
        { w: 2.7, f: padEdge },
        { w: 2.1, f: padFill },
        { w: 0.5, f: cyl(-0.62, 0.14, 0.19, 0.15, 0.05, 'z') },
        { w: 0.3, f: arcT(-0.62, 0.14, 0.19, 0.23, 0, TAU, 0.03) },
        { w: 0.5, f: cyl(0.24, -0.32, 0.19, 0.15, 0.05, 'z') },
        { w: 0.3, f: arcT(0.24, -0.32, 0.19, 0.23, 0, TAU, 0.03) },
        { w: 0.28, f: arcT(-0.3, -0.34, 0.13, 0.17, 0, TAU, 0.03) },
        { w: 0.14, f: box(-0.3, -0.34, 0.2, 0.03, 0.1, 0.02) },
        { w: 0.14, f: box(-0.3, -0.34, 0.2, 0.1, 0.03, 0.02) },
        { w: 0.18, f: shell(0.66, 0.28, 0.2, 0.08) },
        { w: 0.18, f: shell(0.84, 0.1, 0.2, 0.08) },
        { w: 0.18, f: shell(0.66, -0.08, 0.2, 0.08) },
        { w: 0.18, f: shell(0.48, 0.1, 0.2, 0.08) },
        { w: 0.22, f: shell(0, 0.3, 0.2, 0.1) },
        { w: 0.1, f: shell(-0.19, 0.3, 0.2, 0.05) },
        { w: 0.1, f: shell(0.19, 0.3, 0.2, 0.05) },
        { w: 0.3, f: box(-0.6, 0.52, -0.09, 0.19, 0.05, 0.11) },
        { w: 0.3, f: box(0.6, 0.52, -0.09, 0.19, 0.05, 0.11) },
      ]),
    },
    {
      name: 'The Word',
      pts: sample(n, [
        { w: 1.5, f: page(-1) },
        { w: 1.5, f: page(1) },
        { w: 0.5, f: page(-1, -0.16) },
        { w: 0.5, f: page(1, -0.16) },
        { w: 0.5, f: box(0, -0.08, 0, 0.06, 0.2, 1.06) },
        { w: 0.34, f: seg(-0.98, 0.24, -0.34, 0.06, 0.5, 0.02) },
        { w: 0.34, f: seg(0.34, 0.06, 0.98, 0.24, 0.5, 0.02) },
        { w: 0.3, f: seg(0, 0.52, 0, 0.98, 0, 0.02) },
        { w: 0.22, f: seg(-0.22, 0.82, 0.22, 0.82, 0, 0.02) },
      ]),
    },
    {
      name: 'The church',
      pts: sample(n, [
        { w: 1.5, f: box(0.2, -0.42, 0, 0.9, 0.52, 0.58) },
        {
          w: 1.25,
          f: () => {
            const sd = Math.random() < 0.5 ? -1 : 1
            const u = Math.random()
            return [0.2 + sd * 1.0 * (1 - u), 0.1 + u * 0.62 + R(-0.03, 0.03), R(-0.62, 0.62)]
          },
        },
        { w: 0.3, f: box(0.2, 0.73, 0, 0.03, 0.03, 0.62) },
        { w: 1, f: box(-1.2, -0.16, 0, 0.32, 0.78, 0.32) },
        { w: 0.5, f: cone(-1.2, 0.62, 0, 0.42, 0.6) },
        { w: 0.26, f: box(-1.2, 1.42, 0, 0.04, 0.17, 0.04) },
        { w: 0.16, f: box(-1.2, 1.46, 0, 0.11, 0.04, 0.04) },
        { w: 0.34, f: arcT(0.2, -0.5, 0.16, 0.21, 0, Math.PI, 0.03) },
        { w: 0.3, f: box(0.2, -0.72, 0.58, 0.19, 0.2, 0.02) },
        { w: 0.3, f: ringXY(0.2, 0.14, 0.6, 0.17, 0.17) },
        { w: 0.22, f: box(-1.2, 0.2, 0.33, 0.09, 0.13, 0.02) },
        { w: 0.3, f: box(0.2, -0.98, 0, 1.12, 0.05, 0.66) },
      ]),
    },
    {
      name: 'What we build',
      pts: sample(n, [
        {
          w: 1.5,
          f: () => {
            const per = Math.random() * 4
            if (per < 1) return [R(-1.62, 1.62), 1.2, R(-0.05, 0.05)]
            if (per < 2) return [R(-1.62, 1.62), -0.9, R(-0.05, 0.05)]
            if (per < 3) return [-1.62, R(-0.9, 1.2), R(-0.05, 0.05)]
            return [1.62, R(-0.9, 1.2), R(-0.05, 0.05)]
          },
        },
        { w: 0.55, f: box(0, -1.12, 0, 0.34, 0.2, 0.05) },
        { w: 0.5, f: box(0, -1.34, 0, 1.0, 0.06, 0.06) },
        { w: 0.6, f: seg(-0.34, 0.5, -0.78, 0.16, 0.06) },
        { w: 0.6, f: seg(-0.78, 0.16, -0.34, -0.2, 0.06) },
        { w: 0.6, f: seg(0.34, 0.5, 0.78, 0.16, 0.06) },
        { w: 0.6, f: seg(0.78, 0.16, 0.34, -0.2, 0.06) },
        { w: 0.5, f: seg(0.16, -0.28, -0.16, 0.58, 0.06) },
      ]),
    },
    {
      name: 'In your pocket',
      pts: rot(
        sample(n, [
          {
            w: 1.6,
            f: () => {
              const HW = 0.74
              const HH = 1.46
              const r = 0.24
              const sw = HW - r
              const sh = HH - r
              const arcs = TAU * r
              let q = Math.random() * (4 * sw + 4 * sh + arcs)
              const z = R(-0.07, 0.07)
              if (q < 2 * sw) return [-sw + q, HH, z]
              q -= 2 * sw
              if (q < 2 * sw) return [-sw + q, -HH, z]
              q -= 2 * sw
              if (q < 2 * sh) return [-HW, -sh + q, z]
              q -= 2 * sh
              if (q < 2 * sh) return [HW, -sh + q, z]
              q -= 2 * sh
              const a = (q / arcs) * TAU
              const cx = Math.cos(a) >= 0 ? sw : -sw
              const cy = Math.sin(a) >= 0 ? sh : -sh
              return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]
            },
          },
          {
            w: 3,
            f: () => {
              const c = (Math.random() * 4) | 0
              const rw = (Math.random() * 5) | 0
              return [
                -0.48 + c * 0.32 + R(-0.115, 0.115),
                0.98 - rw * 0.32 + R(-0.115, 0.115),
                0.09 + R(-0.015, 0.015),
              ]
            },
          },
          {
            w: 0.75,
            f: () => {
              const c = (Math.random() * 4) | 0
              return [-0.48 + c * 0.32 + R(-0.1, 0.1), -1.12 + R(-0.1, 0.1), 0.09 + R(-0.015, 0.015)]
            },
          },
          { w: 0.22, f: box(0, 1.3, 0.09, 0.15, 0.045, 0.012) },
          { w: 0.2, f: box(-0.78, 0.42, 0, 0.03, 0.17, 0.05) },
          { w: 0.2, f: box(0.78, 0.24, 0, 0.03, 0.26, 0.05) },
        ]),
        0.1,
        -0.44,
      ),
    },
    {
      name: 'Built with AI',
      pts: sample(n, [
        { w: 1.3, f: box(0, 0.76, 0, 0.6, 0.44, 0.4) },
        { w: 0.34, f: shell(-0.26, 0.82, 0.42, 0.13) },
        { w: 0.34, f: shell(0.26, 0.82, 0.42, 0.13) },
        { w: 0.22, f: seg(-0.2, 0.5, 0.2, 0.5, 0.42, 0.025) },
        { w: 0.2, f: box(-0.66, 0.76, 0, 0.06, 0.13, 0.1) },
        { w: 0.2, f: box(0.66, 0.76, 0, 0.06, 0.13, 0.1) },
        { w: 0.24, f: cyl(0, 1.3, 0, 0.035, 0.12, 'y') },
        { w: 0.3, f: shell(0, 1.48, 0, 0.13) },
        { w: 0.22, f: cyl(0, 0.36, 0, 0.13, 0.1, 'y') },
        { w: 1.35, f: box(0, -0.25, 0, 0.54, 0.52, 0.32) },
        { w: 0.3, f: ringXY(0, -0.2, 0.34, 0.17, 0.17) },
        { w: 0.45, f: cyl(-0.76, -0.26, 0, 0.12, 0.4, 'y') },
        { w: 0.45, f: cyl(0.76, -0.26, 0, 0.12, 0.4, 'y') },
        { w: 0.26, f: shell(-0.76, -0.76, 0, 0.16) },
        { w: 0.26, f: shell(0.76, -0.76, 0, 0.16) },
        { w: 0.42, f: cyl(-0.26, -1.04, 0, 0.14, 0.26, 'y') },
        { w: 0.42, f: cyl(0.26, -1.04, 0, 0.14, 0.26, 'y') },
        { w: 0.3, f: box(-0.26, -1.36, 0.05, 0.18, 0.06, 0.15) },
        { w: 0.3, f: box(0.26, -1.36, 0.05, 0.18, 0.06, 0.15) },
      ]),
    },
    {
      name: 'Always learning',
      pts: sample(n, [
        { w: 2.4, f: arcT(-0.26, 0.38, 0.84, 1.04, 0, TAU, 0.1) },
        { w: 0.55, f: arcT(-0.26, 0.38, 0.7, 0.76, 0, TAU, 0.05) },
        {
          w: 0.55,
          f: () => {
            const th = Math.random() * TAU
            const rr = 0.68 * Math.sqrt(Math.random())
            return [-0.26 + Math.cos(th) * rr, 0.38 + Math.sin(th) * rr, R(-0.03, 0.03)]
          },
        },
        { w: 0.5, f: seg(-0.78, 0.76, -0.22, 0.95, 0, 0.035) },
        { w: 0.32, f: seg(-0.86, 0.5, -0.52, 0.85, 0, 0.03) },
        { w: 0.45, f: cyl(0.4, -0.24, 0, 0.15, 0.14, 'x') },
        {
          w: 1.25,
          f: () => {
            const t = Math.random()
            const th = Math.random() * TAU
            const rr = 0.17 * Math.sqrt(Math.random())
            return [
              0.56 + t * 0.82 + Math.cos(th) * rr * 0.72,
              -0.4 - t * 0.82 + Math.sin(th) * rr * 0.72,
              Math.cos(th) * rr,
            ]
          },
        },
        { w: 0.4, f: shell(1.48, -1.34, 0, 0.22, 0.86) },
      ]),
    },
    {
      name: 'A little music',
      pts: sample(n, [
        { w: 1.2, f: shell(-0.52, -0.86, 0, 0.44, 0.72) },
        { w: 1.2, f: shell(0.72, -1.18, 0, 0.44, 0.72) },
        { w: 1, f: tube(-0.1, 0.1, 0, 0.09, 1.0, 'y') },
        { w: 1, f: tube(1.14, -0.22, 0, 0.09, 1.0, 'y') },
        { w: 0.8, f: box(0.52, 1.02, 0, 0.66, 0.11, 0.07) },
      ]),
    },
    {
      name: 'CBU · Riverside',
      pts: sample(n, [
        { w: 1.35, f: arcT(-0.9, 0.05, 0.38, 0.56, 0.64, 5.64, 0.07) },
        { w: 0.72, f: () => [-0.19 + R(-0.09, 0.09), R(-0.51, 0.57), R(-0.07, 0.07)] },
        { w: 0.85, f: arcT(-0.19, 0.31, 0.19, 0.35, -1.52, 1.52, 0.07) },
        { w: 0.9, f: arcT(-0.19, -0.19, 0.21, 0.38, -1.52, 1.52, 0.07) },
        { w: 0.68, f: () => [0.52 + R(-0.09, 0.09), R(-0.12, 0.57), R(-0.07, 0.07)] },
        { w: 0.68, f: () => [1.22 + R(-0.09, 0.09), R(-0.12, 0.57), R(-0.07, 0.07)] },
        { w: 0.95, f: arcT(0.87, -0.1, 0.26, 0.44, Math.PI, TAU, 0.07) },
        { w: 0.3, f: box(0.02, -0.88, 0, 1.18, 0.035, 0.045) },
      ]),
    },
    {
      name: 'For the world',
      pts: sample(n, [
        { w: 0.7, f: shell(0, 0, 0, 1.4) },
        { w: 4.6, f: land },
        { w: 0.28, f: ringAt(0, 1.52) },
        { w: 0.14, f: ringAt(40, 1.52) },
        { w: 0.14, f: ringAt(-40, 1.52) },
        {
          w: 0.2,
          f: () => {
            const th = Math.random() * TAU
            return [0, 1.52 * Math.sin(th), 1.52 * Math.cos(th)]
          },
        },
        {
          w: 0.2,
          f: () => {
            const th = Math.random() * TAU
            return [1.52 * Math.sin(th), 1.52 * Math.cos(th), 0]
          },
        },
      ]),
    },
  ]
}
