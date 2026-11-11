// Step illustrations: cut-away views through one side of the cover, with the
// outside on the left. Each fabric layer is a strip; its thick edge is the
// right side of the fabric. Shared by the web instructions (SVG) and the PDF.
// Units: millimetres on paper, y down.

import type { Params, Pt } from './geometry';

export type FigureStyle =
  | 'outer' // outer or cuff fabric: shaded strip
  | 'lining' // lining fabric: white strip
  | 'right' // right side of the fabric: thick edge
  | 'stitch'
  | 'baste';

export interface FigureShape {
  style: FigureStyle;
  pts: Pt[];
  closed?: boolean;
}

export interface FigureLabel {
  text: string;
  at: Pt;
  anchor: 'start' | 'middle' | 'end';
}

export interface Figure {
  w: number;
  h: number;
  shapes: FigureShape[];
  labels: FigureLabel[];
  caption: string;
}

export const FIGURE_NOTE =
  'Cut-away view of one side, outside on the left. Shaded: outer or cuff fabric; white: lining. The thick edge is the right side of the fabric.';

const W = 52;
const H = 44;
/** Drawn thickness of one fabric layer. */
const T = 2.6;
/** Distance between the centre lines of two layers lying together. */
const PAIR = 3.6;

/** Sample a circular arc (angles in degrees, y down). */
function arc(c: Pt, r: number, a0: number, a1: number, n = 10): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
  });
}

/** Offset a polyline sideways by `d`: positive is to the left of the direction of travel on screen. */
function offset(pts: Pt[], d: number): Pt[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    // Left of travel with y down is (ty, -tx).
    return { x: p.x + (d * (b.y - a.y)) / l, y: p.y - (d * (b.x - a.x)) / l };
  });
}

/** A fabric layer along `centre`, with its right side on the given side of the direction of travel. */
function strip(centre: Pt[], fabric: 'outer' | 'lining', rightSide: 'left' | 'right'): FigureShape[] {
  const left = offset(centre, T / 2);
  const right = offset(centre, -T / 2);
  return [
    { style: fabric, pts: [...left, ...right.reverse()], closed: true },
    { style: 'right', pts: rightSide === 'left' ? left : offset(centre, -T / 2) },
  ];
}

const line = (x0: number, x1: number, y: number, style: FigureStyle): FigureShape => ({
  style,
  pts: [{ x: x0, y }, { x: x1, y }],
});

/** Cuff and cuff lining, right sides together, sewn along the lower edge. */
function cuffSewn(): Figure {
  const top = 6;
  const bottom = 37;
  // A visible gap, so both right sides show as they face each other.
  const gap = T + 1.4;
  const xl = W / 2 - gap / 2;
  const xc = W / 2 + gap / 2;
  return {
    w: W,
    h: H,
    shapes: [
      // Travelling down, "left" on screen is the +x side.
      ...strip([{ x: xl, y: top }, { x: xl, y: bottom }], 'lining', 'left'),
      ...strip([{ x: xc, y: top }, { x: xc, y: bottom }], 'outer', 'right'),
      line(xl - 4, xc + 4, bottom - 3, 'stitch'),
    ],
    labels: [
      { text: 'cuff lining', at: { x: xl - T / 2 - 2, y: top + 8 }, anchor: 'end' },
      { text: 'cuff', at: { x: xc + T / 2 + 2, y: top + 8 }, anchor: 'start' },
      { text: 'stitch', at: { x: xc + 5, y: bottom - 3 }, anchor: 'start' },
    ],
    caption: 'Right sides together: sew the lower edge',
  };
}

/** The cuff as a U: cuff outside (left), cuff lining inside (right), joined at the bottom. */
function cuffU(xCuff: number, top: number, bottom: number): FigureShape[] {
  const r = PAIR / 2;
  const c = { x: xCuff + r, y: bottom };
  // Cuff: down its left leg, then half the turn. Its right side faces out (screen left = -x).
  const cuff = [{ x: xCuff, y: top }, ...arc(c, r, 180, 90)];
  // Lining: the other half of the turn, then up. Its right side faces in (+x).
  const lining = [...arc(c, r, 90, 0), { x: xCuff + PAIR, y: top }];
  // Down the cuff, -x is to the right of travel; up the lining, +x is to the right too.
  return [...strip(cuff, 'outer', 'right'), ...strip(lining, 'lining', 'right')];
}

function cuffTurned(): Figure {
  const top = 6;
  const bottom = 36;
  const x = W / 2 - PAIR / 2;
  return {
    w: W,
    h: H,
    shapes: [...cuffU(x, top, bottom), line(x - 4, x + PAIR + 4, top + 3, 'baste')],
    labels: [
      { text: 'cuff', at: { x: x - T / 2 - 2, y: top + 12 }, anchor: 'end' },
      { text: 'cuff lining', at: { x: x + PAIR + T / 2 + 2, y: top + 12 }, anchor: 'start' },
      { text: 'baste', at: { x: x + PAIR + 5, y: top + 3 }, anchor: 'start' },
    ],
    caption: 'Turn right side out, press, baste the top',
  };
}

function cuffOnShell(p: Params): Figure {
  const top = 5;
  const bottom = 40;
  const cuffBottom = cuffEnd(p, top, bottom);
  const xs = W / 2 + 5;
  const xCuff = xs - T / 2 - 0.8 - T / 2 - PAIR;
  return {
    w: W,
    h: H,
    shapes: [
      // Outer shell, right side out: travelling down, the outside (-x) is on the right of travel.
      ...strip([{ x: xs, y: top }, { x: xs, y: bottom }], 'outer', 'right'),
      ...cuffU(xCuff, top, cuffBottom),
      line(xCuff - 4, xs + 4, top + 3, 'baste'),
    ],
    labels: [
      { text: 'cuff', at: { x: xCuff - T / 2 - 2, y: top + 10 }, anchor: 'end' },
      { text: 'outer shell', at: { x: xs + T / 2 + 2, y: (cuffBottom + bottom) / 2 }, anchor: 'start' },
      { text: 'baste', at: { x: xs + 5, y: top + 3 }, anchor: 'start' },
    ],
    caption: 'Cuff over the shell, top edges level: baste',
  };
}

/** Where the cuff ends, for a wall drawn from `top` to `bottom`. */
function cuffEnd(p: Params, top: number, bottom: number): number {
  // The cuff's share of the wall, kept readable at either extreme.
  const ratio = Math.min(0.7, Math.max(0.2, p.fold / p.height));
  return top + (bottom - top) * ratio;
}

/** Outer shell (with cuff) inside the lining, right sides together, sewn round the top. */
function shellInLining(p: Params): Figure {
  const top = 6;
  const bottom = 40;
  const cuff = p.fold > 0;
  const space = T + 0.8; // centre to centre of two layers lying together
  const xl = W / 2 - (cuff ? PAIR + 2 * space : space) / 2;
  const xCuff = xl + space;
  const xs = cuff ? xCuff + PAIR + space : xl + space;
  return {
    w: W,
    h: H,
    shapes: [
      // Lining, wrong side out: travelling down, its right side (+x, towards the shell) is on the left of travel.
      ...strip([{ x: xl, y: top }, { x: xl, y: bottom }], 'lining', 'left'),
      ...(cuff ? cuffU(xCuff, top, cuffEnd(p, top, bottom)) : []),
      ...strip([{ x: xs, y: top }, { x: xs, y: bottom }], 'outer', 'right'),
      line(xl - 4, xs + 4, top + 3, 'stitch'),
    ],
    labels: [
      { text: 'lining', at: { x: xl - T / 2 - 2, y: top + 12 }, anchor: 'end' },
      { text: 'outer shell', at: { x: xs + T / 2 + 2, y: (top + bottom) / 2 + 6 }, anchor: 'start' },
      { text: 'stitch', at: { x: xs + 5, y: top + 3 }, anchor: 'start' },
    ],
    caption: cuff ? 'Shell and cuff inside the lining: sew the top' : 'Shell inside the lining: sew the top',
  };
}

/** The finished cover: shell and lining joined over the top, cuff hanging outside. */
function finished(p: Params): Figure {
  const top = 6;
  const bottom = 40;
  const cuff = p.fold > 0;
  const xs = W / 2 + (cuff ? 3 : -PAIR / 2);
  const r = PAIR / 2;
  const c = { x: xs + r, y: top + r };
  // Shell up its leg and over half the fold: its right side faces out (-x), left of travel going up.
  const shell = [{ x: xs, y: bottom }, ...arc(c, r, 180, 270)];
  // Lining over the other half and down: its right side faces into the pot (+x), left of travel going down.
  const lining = [...arc(c, r, 270, 360), { x: xs + PAIR, y: bottom }];
  const xCuff = xs - T / 2 - 0.8 - T / 2 - PAIR;
  const cuffBottom = cuffEnd(p, top, bottom);
  return {
    w: W,
    h: H,
    shapes: [
      ...strip(shell, 'outer', 'left'),
      ...strip(lining, 'lining', 'left'),
      ...(cuff ? cuffU(xCuff, top + r, cuffBottom) : []),
      line(xs - 3, xs + PAIR + 3, top + r + 2.5, 'stitch'),
    ],
    labels: [
      ...(cuff ? [{ text: 'cuff', at: { x: xCuff - T / 2 - 2, y: top + 10 }, anchor: 'end' as const }] : []),
      {
        text: 'outer shell',
        at: { x: xs - T / 2 - 2, y: cuff ? (cuffBottom + bottom) / 2 + 2 : top + 14 },
        anchor: 'end',
      },
      { text: 'lining', at: { x: xs + PAIR + T / 2 + 2, y: top + 14 }, anchor: 'start' },
      { text: 'topstitch', at: { x: xs + PAIR + 4, y: top + r + 2.5 }, anchor: 'start' },
    ],
    caption: cuff ? 'Turned: lining inside, cuff hanging outside' : 'Turned: lining inside',
  };
}

/** Illustrations for the cuff ring step. */
export const cuffRingFigures = (): Figure[] => [cuffSewn(), cuffTurned()];
/** Illustration for putting the cuff on the shell. */
export const cuffOnShellFigures = (p: Params): Figure[] => [cuffOnShell(p)];
/** Illustration for sewing the shell and lining together round the top. */
export const shellInLiningFigures = (p: Params): Figure[] => [shellInLining(p)];
/** Illustration of the finished, turned cover. */
export const finishedFigures = (p: Params): Figure[] => [finished(p)];

// --- SVG ---------------------------------------------------------------------

const d = (pts: Pt[], closed?: boolean) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join('') + (closed ? 'Z' : '');

export function figureSvg(f: Figure): string {
  const shapes = f.shapes.map((s) => `<path class="fig-${s.style}" d="${d(s.pts, s.closed)}"/>`).join('');
  const labels = f.labels
    .map((l) => `<text class="fig-label" x="${l.at.x}" y="${l.at.y}" text-anchor="${l.anchor}">${l.text}</text>`)
    .join('');
  return `<figure class="fig"><svg viewBox="0 0 ${f.w} ${f.h}" role="img" aria-label="${f.caption}">${shapes}${labels}</svg><figcaption>${f.caption}</figcaption></figure>`;
}
