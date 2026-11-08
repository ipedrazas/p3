// Geometry for pattern markings, shared by the SVG preview and the PDF.
// Everything is in piece coordinates (cm, y down).

import type { Piece, Pt } from './geometry';

export interface FoldMark {
  /** The fold edge itself. */
  line: [Pt, Pt];
  /** Bracket polyline: tip on fold, out, along, back to tip on fold. */
  bracket: [Pt, Pt, Pt, Pt];
  /** Where the label is anchored (centre of its baseline) and its direction in degrees, y-down. */
  textAt: Pt;
  textAngle: number;
}

const add = (a: Pt, b: Pt, k = 1): Pt => ({ x: a.x + b.x * k, y: a.y + b.y * k });

function centroid(pts: Pt[]): Pt {
  const c = pts.reduce((s, p) => add(s, p), { x: 0, y: 0 });
  return { x: c.x / pts.length, y: c.y / pts.length };
}

/** Bracket with arrows pointing at the fold, offset `depth` cm into the piece. */
export function foldMark(piece: Piece, depth = 1): FoldMark | undefined {
  if (!piece.fold) return undefined;
  const [a, b] = piece.fold;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  // Inward normal: the perpendicular that points towards the piece.
  let n = { x: -u.y, y: u.x };
  const c = centroid(piece.cut);
  if ((c.x - a.x) * n.x + (c.y - a.y) * n.y < 0) n = { x: -n.x, y: -n.y };
  const p1 = add(a, u, len * 0.2);
  const p2 = add(a, u, len * 0.8);
  const tip = 0.1;
  // Text reads along the fold with its top facing into the piece, so the
  // baseline sits against the bracket. Direction t has "up" = n.
  const t = { x: -n.y, y: n.x };
  return {
    line: [a, b],
    bracket: [add(p1, n, tip), add(p1, n, depth), add(p2, n, depth), add(p2, n, tip)],
    textAt: add(add(a, u, len / 2), n, depth + 0.25),
    textAngle: (Math.atan2(t.y, t.x) * 180) / Math.PI,
  };
}

/** Rotate a local offset (dx along text, dy down the text) into page coordinates. */
export function along(origin: Pt, angleDeg: number, dx: number, dy: number): Pt {
  const a = (angleDeg * Math.PI) / 180;
  return {
    x: origin.x + dx * Math.cos(a) - dy * Math.sin(a),
    y: origin.y + dx * Math.sin(a) + dy * Math.cos(a),
  };
}
