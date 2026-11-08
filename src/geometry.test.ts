import { describe, expect, it } from 'vitest';
import {
  buildPattern,
  CUFF_TURN_OF_CLOTH,
  DEFAULTS,
  type Params,
  type Pt,
  polylineLength,
  rotatePiece,
  validate,
} from './geometry';
import { type Layout, layoutPieces, PAGE_MARGIN, pageSize } from './layout';

const piece = (p: Params, id: string) => buildPattern(p).pieces.find((x) => x.id === id)!;

function minDistToPolygon(p: Pt, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

describe('validate', () => {
  it('accepts the defaults', () => expect(validate(DEFAULTS)).toEqual([]));
  it('rejects a fold taller than the pot', () =>
    expect(validate({ ...DEFAULTS, fold: 20 }).map((e) => e.field)).toEqual(['fold']));
  it('needs 3+ panels for a faceted cover', () =>
    expect(validate({ ...DEFAULTS, circular: false, panels: 2 }).map((e) => e.field)).toEqual(['panels']));
  it('rejects non-integer panel counts', () => expect(validate({ ...DEFAULTS, panels: 2.5 }).map((e) => e.field)).toEqual(['panels']));
  it('flags empty fields', () => expect(validate({ ...DEFAULTS, height: NaN }).map((e) => e.field)).toContain('height'));
});

describe('round cover', () => {
  const p = DEFAULTS;
  const rTop = p.top / 2 + p.ease;
  const rBot = p.base / 2 + p.ease;

  it('defaults are diameters', () => expect(p.measure).toBe('diameter'));
  const side = piece(p, 'side');

  it('panel edges add up to the finished circumferences', () => {
    expect(side.edges.top * p.panels).toBeCloseTo(2 * Math.PI * rTop, 6);
    expect(side.edges.bottom * p.panels).toBeCloseTo(2 * Math.PI * rBot, 6);
    expect(side.edges.side).toBeCloseTo(Math.hypot(p.height, rTop - rBot), 6);
  });

  it('stitch outline matches its edge lengths', () => {
    const e = side.edges;
    expect(polylineLength(side.stitch, true)).toBeCloseTo(e.top + e.bottom + 2 * e.side, 1);
  });

  it('base matches the bottom of the side panels', () => {
    expect(piece(p, 'base').edges.circumference).toBeCloseTo(side.edges.bottom * p.panels, 6);
  });

  it('cuff top edge matches the side panel top edge', () => {
    const cuff = piece(p, 'cuff');
    expect(cuff.edges.top).toBeCloseTo(side.edges.top, 6);
    const rAtCuff = rBot + ((rTop - rBot) * (p.height - p.fold)) / p.height;
    expect(cuff.edges.bottom * p.panels).toBeCloseTo(2 * Math.PI * (rAtCuff + CUFF_TURN_OF_CLOTH), 6);
  });

  it('cut line sits one seam allowance outside the stitch line', () => {
    for (const pc of buildPattern(p).pieces) {
      const d = pc.cut.map((q) => minDistToPolygon(q, pc.stitch));
      expect(Math.min(...d)).toBeGreaterThan(p.seam - 0.01);
      // Corners of convex offsets sit further out; edges should be exact.
      expect(d.filter((x) => Math.abs(x - p.seam) < 0.01).length).toBeGreaterThan(d.length / 2);
    }
  });

  it('wide top is drawn above the narrow bottom', () => {
    const spread = (pts: Pt[]) => Math.max(...pts.map((q) => q.x)) - Math.min(...pts.map((q) => q.x));
    const upper = side.stitch.filter((q) => q.y < side.height / 2);
    const lower = side.stitch.filter((q) => q.y >= side.height / 2);
    expect(spread(upper)).toBeGreaterThan(spread(lower));
  });

  it('handles straight-sided (cylindrical) pots', () => {
    const s = piece({ ...p, base: 30, top: 30 }, 'side');
    expect(s.edges.top).toBeCloseTo((2 * Math.PI * 17) / p.panels, 6);
    expect(s.edges.side).toBeCloseTo(p.height, 6);
  });

  it('handles pots that are wider at the base', () => {
    const s = piece({ ...p, base: 36, top: 24 }, 'side');
    expect(s.edges.top * p.panels).toBeCloseTo(2 * Math.PI * 14, 6);
    expect(s.edges.bottom * p.panels).toBeCloseTo(2 * Math.PI * 20, 6);
  });

  it('treats inputs as radii when asked', () => {
    const s = piece({ ...p, measure: 'radius', top: 9, base: 6 }, 'side');
    expect(s.edges.top).toBeCloseTo(side.edges.top, 6);
  });

  it('omits the cuff when fold is 0', () => {
    expect(buildPattern({ ...p, fold: 0 }).pieces.map((x) => x.id)).toEqual(['side', 'base']);
  });
});

describe('faceted cover', () => {
  const p: Params = { ...DEFAULTS, circular: false, panels: 6 };
  const a = p.base / 2 + p.ease;
  it('trapezoid bottoms match the polygon base sides', () => {
    expect(piece(p, 'side').edges.bottom).toBeCloseTo(piece(p, 'base').edges.side, 6);
    expect(piece(p, 'base').edges.side).toBeCloseTo(2 * a * Math.tan(Math.PI / 6), 6);
  });
  it('cuff top matches side top', () => {
    expect(piece(p, 'cuff').edges.top).toBeCloseTo(piece(p, 'side').edges.top, 6);
  });
});

describe('cut on fold', () => {
  for (const [name, params] of [
    ['round', DEFAULTS],
    ['round, 1 panel', { ...DEFAULTS, panels: 1 }],
    ['straight-sided', { ...DEFAULTS, top: 20, base: 20 }],
    ['hexagonal', { ...DEFAULTS, circular: false, panels: 6 }],
    ['pentagonal', { ...DEFAULTS, circular: false, panels: 5 }],
  ] as const) {
    it(`halves every piece (${name})`, () => {
      const full = buildPattern(params).pieces;
      const half = buildPattern({ ...params, onFold: true }).pieces;
      half.forEach((h, i) => {
        const f = full[i];
        expect(h.fold, h.id).toBeDefined();
        // Grainline is parallel to the fold.
        expect(h.grain[0].x).toBeCloseTo(h.grain[1].x, 9);
        expect(h.grain[0].x).toBeLessThan(h.width - 1);
        // Half the width: from the fold to the far cut edge.
        expect(h.width).toBeCloseTo(f.width / 2, 1);
        expect(h.height).toBeCloseTo(f.height, 1);
        // Fold edge is vertical, on the right, and is the closing segment of the cut line.
        const [a, b] = h.fold!;
        expect(a.x).toBeCloseTo(h.width, 6);
        expect(b.x).toBeCloseTo(h.width, 6);
        expect(a).toEqual(h.cut[h.cut.length - 1]);
        expect(b).toEqual(h.cut[0]);
        // No other cut or stitch point lies on the fold line besides the ends.
        expect(h.cut.filter((q) => Math.abs(q.x - h.width) < 1e-6)).toHaveLength(2);
        expect(h.stitch.filter((q) => Math.abs(q.x - h.width) < 1e-6)).toHaveLength(2);
        // The open half stitch line is exactly half the full outline.
        expect(polylineLength(h.stitch, false) * 2).toBeCloseTo(polylineLength(f.stitch, true), 1);
        expect(h.cutting.every((c) => c.includes('on fold'))).toBe(true);
      });
    });
  }
});

describe('matching notches', () => {
  const count = (p: Params, id: string) => piece(p, id).notches.length;

  it('adds evenly spaced notches to round covers with fewer than 4 panels', () => {
    // 2 panels: each edge split in 4 (3 notches per edge, top and bottom).
    expect(count(DEFAULTS, 'side')).toBe(6);
    expect(count(DEFAULTS, 'cuff')).toBe(6);
    expect(count(DEFAULTS, 'base')).toBe(8);
    // 1 panel: split in 8.
    expect(count({ ...DEFAULTS, panels: 1 }, 'side')).toBe(14);
    expect(count({ ...DEFAULTS, panels: 1 }, 'base')).toBe(8);
    // 3 panels: split in 3.
    expect(count({ ...DEFAULTS, panels: 3 }, 'side')).toBe(4);
    expect(count({ ...DEFAULTS, panels: 3 }, 'base')).toBe(9);
  });

  it('keeps a single centre notch per edge otherwise', () => {
    expect(count({ ...DEFAULTS, panels: 4 }, 'side')).toBe(2);
    expect(count({ ...DEFAULTS, panels: 4 }, 'base')).toBe(8);
    expect(count({ ...DEFAULTS, circular: false, panels: 3 }, 'side')).toBe(2);
  });

  it('places side and cuff top notches at the same distances along the edge', () => {
    // Top-edge notches point down into the piece. Their spacing along the
    // edge must be the same on both pieces (a quarter of the panel's top edge).
    const spacing = (id: string) => {
      const pc = piece(DEFAULTS, id);
      const top = pc.notches.filter(([a, b]) => b.y > a.y).map(([a]) => a).sort((p, q) => p.x - q.x);
      return top.slice(1).map((q, i) => Math.hypot(q.x - top[i].x, q.y - top[i].y));
    };
    const side = spacing('side');
    const cuff = spacing('cuff');
    expect(side).toHaveLength(2);
    // Measured on the cut line (1.5 cm out from the stitch line), so allow a few mm.
    side.forEach((d, i) => expect(Math.abs(cuff[i] - d)).toBeLessThan(0.3));
    expect(side[0]).toBeCloseTo(piece(DEFAULTS, 'side').edges.top / 4, 0);
  });

  it('notches start on the cut line and point inwards', () => {
    for (const p of [DEFAULTS, { ...DEFAULTS, panels: 1 }, { ...DEFAULTS, top: 20, base: 20 }]) {
      for (const pc of buildPattern(p).pieces) {
        for (const [a, b] of pc.notches) {
          expect(minDistToPolygon(a, pc.cut)).toBeLessThan(0.02);
          expect(minDistToPolygon(b, pc.stitch)).toBeLessThan(minDistToPolygon(a, pc.stitch));
        }
      }
    }
  });

  it('keeps the off-centre notches on half pieces', () => {
    // 2 panels on the fold: centre notches go, one notch each side of it stays per edge.
    expect(count({ ...DEFAULTS, onFold: true }, 'side')).toBe(2);
    expect(count({ ...DEFAULTS, onFold: true }, 'base')).toBe(3);
  });
});

describe('printer scale', () => {
  it('is validated', () => {
    expect(validate({ ...DEFAULTS, printScale: 50 }).map((e) => e.field)).toEqual(['printScale']);
    expect(validate({ ...DEFAULTS, printScale: 98 })).toEqual([]);
  });

  it('shrinks the usable page area in true centimetres', () => {
    const pieces = buildPattern({ ...DEFAULTS, onFold: true }).pieces;
    const plain = layoutPieces(pieces, pageSize('A4'));
    const scaled = layoutPieces(pieces, pageSize('A4'), 100 / 98);
    expect(scaled.scale).toBeCloseTo(100 / 98, 9);
    const sh = scaled.sheets[0];
    const ref = plain.sheets[0];
    const portrait = (s: typeof sh) => (s.landscape ? s.tileH : s.tileW);
    expect(portrait(sh)).toBeCloseTo(21 / (100 / 98) - 2 * PAGE_MARGIN, 6);
    expect(portrait(ref)).toBeCloseTo(21 - 2 * PAGE_MARGIN, 6);
    expectCovered(scaled, pieces.length);
  });
});

describe('rotatePiece', () => {
  it('keeps edge lengths and swaps width and height at 90 degrees', () => {
    const side = piece(DEFAULTS, 'side');
    const r = rotatePiece(side, 90);
    expect(r.width).toBeCloseTo(side.height, 6);
    expect(r.height).toBeCloseTo(side.width, 6);
    expect(polylineLength(r.cut, true)).toBeCloseTo(polylineLength(side.cut, true), 6);
    expect(r.rotation).toBe(90);
    expect(Math.min(...r.cut.map((q) => q.x))).toBeCloseTo(0, 6);
    expect(Math.min(...r.cut.map((q) => q.y))).toBeCloseTo(0, 6);
  });
});

/** Every cut-line point of every piece lies on a printed page of its sheet. */
function expectCovered(l: Layout, pieces: number) {
  expect(l.sheets.flatMap((s) => s.placed)).toHaveLength(pieces);
  expect(l.pageCount).toBe(l.sheets.reduce((n, s) => n + s.usedTiles.length, 0));
  for (const sh of l.sheets) {
    for (const pl of sh.placed) {
      for (const q of pl.piece.cut) {
        const x = q.x + pl.x;
        const y = q.y + pl.y;
        const tile = sh.usedTiles.find(
          (t) => x >= t.x - 1e-6 && x <= t.x + sh.tileW + 1e-6 && y >= t.y - 1e-6 && y <= t.y + sh.tileH + 1e-6,
        );
        expect(tile, `${pl.piece.id} at ${x},${y}`).toBeDefined();
      }
    }
  }
}

describe('layout', () => {
  const ids = ['A4', 'A3', 'Letter', 'Legal', 'A0'] as const;
  for (const id of ids) {
    for (const onFold of [false, true]) {
      for (const circular of [true, false]) {
        it(`covers every piece (${id}, ${onFold ? 'on fold' : 'full'}, ${circular ? 'round' : 'hexagonal'})`, () => {
          const p = { ...DEFAULTS, onFold, circular, panels: circular ? 2 : 6 };
          const pattern = buildPattern(p);
          expectCovered(layoutPieces(pattern.pieces, pageSize(id)), pattern.pieces.length);
        });
      }
    }
  }

  it('puts each default piece on its own single A4 page when cut on fold', () => {
    const l = layoutPieces(buildPattern({ ...DEFAULTS, onFold: true }).pieces, pageSize('A4'));
    expect(l.sheets.map((s) => s.title)).toEqual(['Side panel', 'Cuff panel', 'Base']);
    expect(l.sheets.every((s) => s.usedTiles.length === 1)).toBe(true);
    expect(l.pageCount).toBe(3);
  });

  it('tiles a piece that is too big for one page, on its own pages', () => {
    const l = layoutPieces(buildPattern(DEFAULTS).pieces, pageSize('A4'));
    const side = l.sheets.find((s) => s.title === 'Side panel')!;
    expect(side.placed).toHaveLength(1);
    expect(side.usedTiles.length).toBeGreaterThan(1);
  });

  it('fits everything on a single A0 sheet', () => {
    const l = layoutPieces(buildPattern(DEFAULTS).pieces, pageSize('A0'));
    expect(l.sheets).toHaveLength(1);
    expect(l.pageCount).toBe(1);
  });

  it('keeps rotations within (-90, 90] so labels are never upside down', () => {
    for (const id of ids) {
      const l = layoutPieces(buildPattern({ ...DEFAULTS, onFold: true }).pieces, pageSize(id));
      for (const pl of l.sheets.flatMap((s) => s.placed)) {
        expect(pl.piece.rotation).toBeGreaterThan(-90);
        expect(pl.piece.rotation).toBeLessThanOrEqual(90);
      }
    }
  });
});

describe('default pattern with a 98% printer', () => {
  it('still fits each half piece on its own A4 page', () => {
    const l = layoutPieces(buildPattern({ ...DEFAULTS, onFold: true }).pieces, pageSize('A4'), 100 / 98);
    expect(l.pageCount).toBe(3);
  });
});
