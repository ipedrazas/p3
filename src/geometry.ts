// Pattern geometry. All lengths are in centimetres.
// Coordinates use a y-down system (like SVG and PDF pages), so "up" on the
// printed pattern is negative y.

export type Pt = { x: number; y: number };
export type Seg = [Pt, Pt];

export type PageSizeId = 'A4' | 'A3' | 'Letter' | 'Legal' | 'A0';

export interface Params {
  /** Pot base, as radius or diameter depending on `measure`. */
  base: number;
  /** Pot top, as radius or diameter depending on `measure`. */
  top: number;
  height: number;
  /** Height of the folded-over cuff at the top. 0 = no cuff. */
  fold: number;
  seam: number;
  /** Radial gap between the pot wall and the cover. */
  ease: number;
  /** Number of side panels (= number of side seams). */
  panels: number;
  /** true: round cover. false: faceted cover with a regular polygon base. */
  circular: boolean;
  measure: 'radius' | 'diameter';
  /** Print only half of each (symmetric) piece, to be cut on the fabric fold. */
  onFold: boolean;
  pageSize: PageSizeId;
}

export const DEFAULTS: Params = {
  base: 12,
  top: 18,
  height: 17,
  fold: 5,
  seam: 1.5,
  ease: 2,
  panels: 2,
  circular: true,
  measure: 'diameter',
  onFold: false,
  pageSize: 'A4',
};

/** Extra radius given to the cuff's lower edge so it sits over the outer shell. */
export const CUFF_TURN_OF_CLOTH = 0.3;

export interface Guide {
  pts: Pt[];
  label?: string;
}

export interface Piece {
  id: string;
  title: string;
  /** Cutting instructions, one line each. */
  cutting: string[];
  /**
   * Cut line, as a polygon. When `fold` is set, the closing segment (last
   * point back to first) is the fold edge and is not drawn as a cut line.
   */
  cut: Pt[];
  /** Stitch line. Same convention as `cut`: open across the fold edge when folded. */
  stitch: Pt[];
  guides: Guide[];
  notches: Seg[];
  /** Grainline: place parallel to the selvedge. */
  grain: Seg;
  /** "Place on fold" edge when cut on the fold. */
  fold?: Seg;
  /** Rotation applied for layout, in degrees clockwise on the page (labels follow it). */
  rotation: number;
  labelAt: Pt;
  /** Finished (stitch-line) edge lengths, for reference and testing. */
  edges: Record<string, number>;
  width: number;
  height: number;
}

export interface Summary {
  topRadius: number;
  baseRadius: number;
  slant: number;
  topCircumference: number;
  baseCircumference: number;
  panelAngleDeg?: number;
}

export interface Pattern {
  params: Params;
  pieces: Piece[];
  summary: Summary;
}

// ---------------------------------------------------------------------------
// Validation

export interface FieldError {
  field: keyof Params;
  message: string;
}

export function validate(p: Params): FieldError[] {
  const errors: FieldError[] = [];
  const err = (field: keyof Params, message: string) => errors.push({ field, message });
  const check = (field: keyof Params, name: string, ok: (v: number) => boolean, message: string) => {
    const v = p[field] as number;
    if (!Number.isFinite(v)) err(field, `${name} must be a number.`);
    else if (!ok(v)) err(field, message);
  };
  check('top', 'Top', (v) => v > 0, 'Top must be greater than 0.');
  check('base', 'Base', (v) => v > 0, 'Base must be greater than 0.');
  check('height', 'Height', (v) => v > 0, 'Height must be greater than 0.');
  check('fold', 'Fold', (v) => v >= 0 && !(v >= p.height), 'Fold must be at least 0 and less than the height.');
  check('seam', 'Seam allowance', (v) => v >= 0 && v <= 5, 'Seam allowance must be between 0 and 5 cm.');
  check('ease', 'Ease', (v) => v >= 0 && v <= 20, 'Ease must be between 0 and 20 cm.');
  check(
    'panels',
    'Side panels',
    (v) => Number.isInteger(v) && v >= 1 && v <= 24,
    'Side panels must be a whole number between 1 and 24.',
  );
  if (!errors.some((e) => e.field === 'panels') && !p.circular && p.panels < 3)
    err('panels', 'A faceted (non-round) cover needs at least 3 side panels.');
  return errors;
}

// ---------------------------------------------------------------------------
// Small geometry helpers

const TAU = Math.PI * 2;
const ARC_STEP = 0.3; // max chord length when sampling arcs

const pt = (x: number, y: number): Pt => ({ x, y });

/** Point at distance r from the origin, angle phi measured from the +y axis. */
const polar = (r: number, phi: number): Pt => pt(r * Math.sin(phi), r * Math.cos(phi));

function arc(r: number, a0: number, a1: number): Pt[] {
  const steps = Math.max(8, Math.ceil((Math.abs(a1 - a0) * r) / ARC_STEP));
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) out.push(polar(r, a0 + ((a1 - a0) * i) / steps));
  return out;
}

export function polylineLength(pts: Pt[], closed = false): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (closed && pts.length > 1)
    len += Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  return len;
}

function signedArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Offset a convex polygon outwards by d. */
export function offsetConvex(poly: Pt[], d: number): Pt[] {
  if (d === 0) return poly.map((p) => ({ ...p }));
  const s = signedArea(poly) > 0 ? 1 : -1;
  const n = poly.length;
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % n];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy);
    const nx = (s * dy) / len;
    const ny = (-s * dx) / len;
    return { p: pt(p.x + nx * d, p.y + ny * d), dx, dy };
  });
  return lines.map((l1, i) => {
    const l0 = lines[(i - 1 + n) % n];
    // Intersect l0 (p0 + t*d0) with l1 (p1 + u*d1).
    const det = l0.dx * l1.dy - l0.dy * l1.dx;
    if (Math.abs(det) < 1e-12) return l1.p;
    const t = ((l1.p.x - l0.p.x) * l1.dy - (l1.p.y - l0.p.y) * l1.dx) / det;
    return pt(l0.p.x + t * l0.dx, l0.p.y + t * l0.dy);
  });
}

/** Short notch mark from a point on the cut line, pointing inwards along `dir`. */
function notchLen(seam: number): number {
  return seam > 0 ? Math.min(0.6, seam * 0.6) : 0.4;
}

function notch(at: Pt, dir: Pt, len: number): Seg {
  const l = Math.hypot(dir.x, dir.y);
  return [at, pt(at.x + (dir.x / l) * len, at.y + (dir.y / l) * len)];
}

// ---------------------------------------------------------------------------
// Raw shapes (before normalisation)

interface Shape {
  cut: Pt[];
  stitch: Pt[];
  guides: Guide[];
  notches: Seg[];
  grain: Seg;
  labelAt: Pt;
  edges: Record<string, number>;
}

function mapShape(s: Shape, f: (p: Pt) => Pt): Shape {
  return {
    cut: s.cut.map(f),
    stitch: s.stitch.map(f),
    guides: s.guides.map((g) => ({ ...g, pts: g.pts.map(f) })),
    notches: s.notches.map(([a, b]) => [f(a), f(b)] as Seg),
    grain: [f(s.grain[0]), f(s.grain[1])],
    labelAt: f(s.labelAt),
    edges: s.edges,
  };
}

/**
 * One panel of a band cut from a (possibly inverted) truncated cone.
 * rTop/rBot are the radii of the full cone section at z = h and z = 0;
 * the band covers zFrom..zTo. Returned with the top of the band facing up.
 */
function coneBand(
  rTop: number,
  rBot: number,
  h: number,
  n: number,
  zFrom: number,
  zTo: number,
  seam: number,
  guideZ: { z: number; label: string }[] = [],
): Shape {
  const r = (z: number) => rBot + ((rTop - rBot) * z) / h;
  const dr = rTop - rBot;
  const nl = notchLen(seam);

  if (Math.abs(dr) < 1e-6) {
    // Cylinder: a plain rectangle, top at y = 0.
    const hw = (Math.PI * rTop) / n;
    const H = zTo - zFrom;
    const stitch = [pt(-hw, 0), pt(hw, 0), pt(hw, H), pt(-hw, H)];
    return {
      stitch,
      cut: offsetConvex(stitch, seam),
      guides: guideZ.map((g) => ({ label: g.label, pts: [pt(-hw, zTo - g.z), pt(hw, zTo - g.z)] })),
      notches: [notch(pt(0, -seam), pt(0, 1), nl), notch(pt(0, H + seam), pt(0, -1), nl)],
      grain: [pt(-hw * 0.45, H * 0.15), pt(-hw * 0.45, H * 0.85)],
      labelAt: pt(hw * 0.35, H / 2),
      edges: { top: 2 * hw, bottom: 2 * hw, side: H },
    };
  }

  // Cone: develop around the apex. Canonical frame has the apex at the
  // origin and the cone axis along +y, so distance from apex grows downwards.
  const slant = Math.hypot(h, dr);
  const k = slant / Math.abs(dr); // slant distance from apex per unit radius
  const alpha = Math.PI / (k * n); // half angle of one panel
  const L = (z: number) => r(z) * k;
  const ri = Math.min(L(zFrom), L(zTo));
  const ro = Math.max(L(zFrom), L(zTo));

  const stitch = [...arc(ro, -alpha, alpha), ...arc(ri, alpha, -alpha)];

  // Cut line: arcs grown by the seam allowance, sides offset parallel.
  const corner = (rho: number) => {
    const t = Math.sqrt(Math.max(rho * rho - seam * seam, 0));
    const u = pt(Math.sin(alpha), Math.cos(alpha));
    const nrm = pt(Math.cos(alpha), -Math.sin(alpha));
    const c = pt(t * u.x + seam * nrm.x, t * u.y + seam * nrm.y);
    return Math.atan2(c.x, c.y);
  };
  const rco = ro + seam;
  const rci = Math.max(ri - seam, 0.01);
  const phiO = corner(rco);
  const phiI = corner(rci);
  const cut = [...arc(rco, -phiO, phiO), ...arc(rci, phiI, -phiI)];

  const mid = (ri + ro) / 2;
  const halfMid = mid * Math.sin(alpha);
  const base: Shape = {
    stitch,
    cut,
    guides: guideZ.map((g) => ({ label: g.label, pts: arc(L(g.z), -alpha, alpha) })),
    notches: [notch(pt(0, rco), pt(0, -1), nl), notch(pt(0, rci), pt(0, 1), nl)],
    grain: [pt(-halfMid * 0.45, ri + (ro - ri) * 0.15), pt(-halfMid * 0.45, ri + (ro - ri) * 0.85)],
    labelAt: pt(halfMid * 0.35, mid),
    edges: {
      top: 2 * alpha * L(zTo),
      bottom: 2 * alpha * L(zFrom),
      side: ro - ri,
    },
  };
  // Widening cone: the far (outer) arc is the top, so flip it up.
  return dr > 0 ? mapShape(base, (p) => pt(p.x, -p.y)) : base;
}

/** One trapezoid face of a regular n-sided frustum. aTop/aBot are inradii. */
function polygonBand(
  aTop: number,
  aBot: number,
  h: number,
  n: number,
  zFrom: number,
  zTo: number,
  seam: number,
  guideZ: { z: number; label: string }[] = [],
): Shape {
  const tan = Math.tan(Math.PI / n);
  const a = (z: number) => aBot + ((aTop - aBot) * z) / h;
  const hw = (z: number) => a(z) * tan;
  const k = Math.hypot(h, aTop - aBot) / h; // face slant per unit height
  const y = (z: number) => (zTo - z) * k;
  const H = y(zFrom);
  const stitch = [pt(-hw(zTo), 0), pt(hw(zTo), 0), pt(hw(zFrom), H), pt(-hw(zFrom), H)];
  const nl = notchLen(seam);
  const hwMid = hw((zFrom + zTo) / 2);
  return {
    stitch,
    cut: offsetConvex(stitch, seam),
    guides: guideZ.map((g) => ({ label: g.label, pts: [pt(-hw(g.z), y(g.z)), pt(hw(g.z), y(g.z))] })),
    notches: [notch(pt(0, -seam), pt(0, 1), nl), notch(pt(0, H + seam), pt(0, -1), nl)],
    grain: [pt(-hwMid * 0.45, H * 0.15), pt(-hwMid * 0.45, H * 0.85)],
    labelAt: pt(hwMid * 0.35, H / 2),
    edges: {
      top: 2 * hw(zTo),
      bottom: 2 * hw(zFrom),
      side: Math.hypot(H, hw(zFrom) - hw(zTo)),
    },
  };
}

function circleBase(R: number, n: number, seam: number): Shape {
  const stitch = arc(R, 0, TAU).slice(0, -1);
  const cut = arc(R + seam, 0, TAU).slice(0, -1);
  const nl = notchLen(seam);
  // Notch at every side seam and half way between them.
  const marks = Math.max(2, 2 * n);
  const notches: Seg[] = [];
  for (let i = 0; i < marks; i++) {
    const phi = Math.PI + (TAU * i) / marks; // first notch at the top
    const at = polar(R + seam, phi);
    notches.push(notch(at, pt(-at.x, -at.y), nl));
  }
  return {
    stitch,
    cut,
    guides: [],
    notches,
    grain: [pt(-R * 0.45, -R * 0.6), pt(-R * 0.45, R * 0.6)],
    labelAt: pt(R * 0.1, 0),
    edges: { circumference: TAU * R },
  };
}

function polygonBase(inradius: number, n: number, seam: number): Shape {
  const Rc = inradius / Math.cos(Math.PI / n);
  const stitch: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const phi = Math.PI / 2 + Math.PI / n + (TAU * i) / n; // flat edge at the bottom
    stitch.push(pt(Rc * Math.cos(phi), Rc * Math.sin(phi)));
  }
  const cut = offsetConvex(stitch, seam);
  const nl = notchLen(seam);
  const notches: Seg[] = cut.map((p, i) => {
    const q = cut[(i + 1) % n];
    const m = pt((p.x + q.x) / 2, (p.y + q.y) / 2);
    return notch(m, pt(-m.x, -m.y), nl);
  });
  return {
    stitch,
    cut,
    guides: [],
    notches,
    grain: [pt(-inradius * 0.45, -inradius * 0.6), pt(-inradius * 0.45, inradius * 0.6)],
    labelAt: pt(inradius * 0.1, 0),
    edges: { side: 2 * inradius * Math.tan(Math.PI / n), perimeter: 2 * n * inradius * Math.tan(Math.PI / n) },
  };
}

// ---------------------------------------------------------------------------
// Pattern assembly

function bbox(pts: Pt[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

// --- Cutting on the fold ----------------------------------------------------
// Every piece is symmetric about x = 0 in its construction frame, so for
// "cut on fold" we keep the left half (x <= 0) and the axis becomes the fold.

const EPS = 1e-9;
const onAxis = (p: Pt) => Math.abs(p.x) < 1e-7;
const axisCross = (a: Pt, b: Pt): Pt => pt(0, a.y + ((b.y - a.y) * a.x) / (a.x - b.x));
const snap = (p: Pt): Pt => (onAxis(p) ? pt(0, p.y) : p);

/** Clip a closed polygon to x <= 0 and open it across the fold edge. */
function halvePolygon(poly: Pt[]): Pt[] {
  const src = poly.map(snap);
  const out: Pt[] = [];
  for (let i = 0; i < src.length; i++) {
    const a = src[(i - 1 + src.length) % src.length];
    const b = src[i];
    const aIn = a.x <= EPS;
    const bIn = b.x <= EPS;
    if (bIn) {
      if (!aIn) out.push(axisCross(a, b));
      out.push(b);
    } else if (aIn) out.push(axisCross(a, b));
  }
  // Drop duplicates and the inner points of runs along the axis.
  const dedup = out.filter((p, i) => {
    const q = out[(i - 1 + out.length) % out.length];
    return Math.hypot(p.x - q.x, p.y - q.y) > 1e-9;
  });
  const n = dedup.length;
  const trimmed = dedup.filter(
    (p, i) => !(onAxis(p) && onAxis(dedup[(i - 1 + n) % n]) && onAxis(dedup[(i + 1) % n])),
  );
  // Rotate so the fold segment is the closing segment.
  const m = trimmed.length;
  const i = trimmed.findIndex((p, k) => onAxis(p) && onAxis(trimmed[(k + 1) % m]));
  if (i < 0) return trimmed;
  return [...trimmed.slice(i + 1), ...trimmed.slice(0, i + 1)];
}

/** Clip an open polyline to x <= 0. */
function halvePolyline(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const b = snap(pts[i]);
    const bIn = b.x <= EPS;
    if (i > 0) {
      const a = snap(pts[i - 1]);
      const aIn = a.x <= EPS;
      if (aIn !== bIn) out.push(axisCross(a, b));
    }
    if (bIn) out.push(b);
  }
  return out;
}

/** x of the leftmost crossing of a polygon with the horizontal line at y. */
function leftmostAt(poly: Pt[], y: number): number {
  let best = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if ((a.y <= y && b.y >= y) || (b.y <= y && a.y >= y)) {
      const x = a.y === b.y ? Math.min(a.x, b.x) : a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
      best = Math.min(best, x);
    }
  }
  return best;
}

interface FoldedShape extends Shape {
  fold?: Seg;
}

/** Distance of the fold grainline from the fold, in cm. */
const FOLD_GRAIN_OFFSET = 2.2;

function halve(s: Shape): FoldedShape {
  const cut = halvePolygon(s.cut);
  const [g0, g1] = s.grain;
  const xl = leftmostAt(cut, s.labelAt.y);
  // Grainline parallel to the fold, between the fold bracket and the label.
  const gx = Math.max(-FOLD_GRAIN_OFFSET, xl * 0.35);
  return {
    cut,
    stitch: halvePolygon(s.stitch),
    guides: s.guides.map((g) => ({ ...g, pts: halvePolyline(g.pts) })).filter((g) => g.pts.length > 1),
    // Centre notches are replaced by the fold crease.
    notches: s.notches.filter(([a, b]) => a.x <= EPS && b.x <= EPS && !(onAxis(a) && onAxis(b))),
    grain: [pt(gx, g0.y), pt(gx, g1.y)],
    // Centre the label between the cut edge and the grainline.
    labelAt: pt((xl + gx - 0.6) / 2, s.labelAt.y),
    edges: s.edges,
    fold: [cut[cut.length - 1], cut[0]],
  };
}

function finish(id: string, title: string, cutting: string[], shape: Shape, onFold: boolean): Piece {
  const s: FoldedShape = onFold ? halve(shape) : shape;
  const b = bbox([...s.cut, ...s.notches.flat()]);
  const f = (p: Pt) => pt(p.x - b.minX, p.y - b.minY);
  return {
    id,
    title,
    cutting,
    cut: s.cut.map(f),
    stitch: s.stitch.map(f),
    guides: s.guides.map((g) => ({ ...g, pts: g.pts.map(f) })),
    notches: s.notches.map(([p, q]) => [f(p), f(q)] as Seg),
    grain: [f(s.grain[0]), f(s.grain[1])],
    fold: s.fold && [f(s.fold[0]), f(s.fold[1])],
    labelAt: f(s.labelAt),
    edges: s.edges,
    rotation: 0,
    width: b.maxX - b.minX,
    height: b.maxY - b.minY,
  };
}

/** Bounding box of everything that must stay on the paper. */
export function pieceExtent(piece: Pick<Piece, 'cut' | 'notches'>) {
  return bbox([...piece.cut, ...piece.notches.flat()]);
}

/**
 * Rotate a piece by `deg` degrees clockwise (as seen on the page) and move
 * it back to the origin. Rotation is relative to the piece as built.
 */
export function rotatePiece(piece: Piece, deg: number): Piece {
  const total = piece.rotation + deg;
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const sn = Math.sin(a);
  // y-down coordinates: this matrix turns clockwise on screen.
  const r = (p: Pt) => pt(p.x * c - p.y * sn, p.x * sn + p.y * c);
  const rotated = {
    cut: piece.cut.map(r),
    notches: piece.notches.map(([p, q]) => [r(p), r(q)] as Seg),
  };
  const b = pieceExtent(rotated);
  const f = (p: Pt) => {
    const q = r(p);
    return pt(q.x - b.minX, q.y - b.minY);
  };
  return {
    ...piece,
    cut: piece.cut.map(f),
    stitch: piece.stitch.map(f),
    guides: piece.guides.map((g) => ({ ...g, pts: g.pts.map(f) })),
    notches: piece.notches.map(([p, q]) => [f(p), f(q)] as Seg),
    grain: [f(piece.grain[0]), f(piece.grain[1])],
    fold: piece.fold && [f(piece.fold[0]), f(piece.fold[1])],
    labelAt: f(piece.labelAt),
    rotation: total,
    width: b.maxX - b.minX,
    height: b.maxY - b.minY,
  };
}

/** Size of a piece's extent when rotated by `deg`, without building it. */
export function rotatedSize(piece: Piece, deg: number): { w: number; h: number } {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const sn = Math.sin(a);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of [...piece.cut, ...piece.notches.flat()]) {
    const x = p.x * c - p.y * sn;
    const y = p.x * sn + p.y * c;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { w: maxX - minX, h: maxY - minY };
}

export function buildPattern(p: Params): Pattern {
  const scale = p.measure === 'diameter' ? 0.5 : 1;
  const rTop = p.top * scale + p.ease;
  const rBot = p.base * scale + p.ease;
  const n = p.panels;
  const h = p.height;
  const f = p.fold;
  const sa = p.seam;
  const cuffZ = h - f;
  const pieces: Piece[] = [];

  const band = p.circular ? coneBand : polygonBand;
  const fold = p.onFold;
  const cut = (count: number, fabric: string) => `Cut ${count}${fold ? ' on fold' : ''} in ${fabric}`;
  const guides = f > 0 ? [{ z: cuffZ, label: 'cuff edge' }] : [];

  pieces.push(
    finish(
      'side',
      'Side panel',
      [cut(n, 'outer fabric'), cut(n, 'lining')],
      band(rTop, rBot, h, n, 0, h, sa, guides),
      fold,
    ),
  );

  if (f > 0) {
    // The cuff hangs over the outside of the shell: same top edge, a little
    // extra room at its lower edge for the thickness of the cloth.
    const rCuffBot = rBot + ((rTop - rBot) * cuffZ) / h + CUFF_TURN_OF_CLOTH;
    pieces.push(
      finish(
        'cuff',
        'Cuff panel',
        [cut(n, 'cuff fabric'), cut(n, 'cuff lining')],
        band(rTop, rCuffBot, f, n, 0, f, sa),
        fold,
      ),
    );
  }

  pieces.push(
    finish(
      'base',
      'Base',
      [cut(1, 'outer fabric'), cut(1, 'lining')],
      p.circular ? circleBase(rBot, n, sa) : polygonBase(rBot, n, sa),
      fold,
    ),
  );

  const slant = Math.hypot(h, rTop - rBot);
  const perim = (r: number) => (p.circular ? TAU * r : 2 * n * r * Math.tan(Math.PI / n));
  const summary: Summary = {
    topRadius: rTop,
    baseRadius: rBot,
    slant,
    topCircumference: perim(rTop),
    baseCircumference: perim(rBot),
  };
  if (p.circular && Math.abs(rTop - rBot) > 1e-6) {
    summary.panelAngleDeg = ((TAU * Math.abs(rTop - rBot)) / slant / n) * (180 / Math.PI);
  }
  return { params: p, pieces, summary };
}
