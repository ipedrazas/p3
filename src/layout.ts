// Places pattern pieces on printer pages. Units: centimetres.
//
// Strategy, in order of preference:
//  1. Everything fits on one page (e.g. A0 at a copy shop): one page.
//  2. Otherwise each piece gets its own page, rotated if that makes it fit,
//     so nothing needs cutting and taping.
//  3. A piece too big for any page gets its own set of tiled pages.

import { type PageSizeId, type Piece, type Pt, rotatePiece, rotatedSize } from './geometry';

export interface PageSize {
  id: PageSizeId;
  label: string;
  /** Portrait width/height in millimetres. */
  w: number;
  h: number;
}

export const PAGE_SIZES: PageSize[] = [
  { id: 'A4', label: 'DIN A4 (210 × 297 mm)', w: 210, h: 297 },
  { id: 'A3', label: 'DIN A3 (297 × 420 mm)', w: 297, h: 420 },
  { id: 'Letter', label: 'US Letter (8.5 × 11 in)', w: 215.9, h: 279.4 },
  { id: 'Legal', label: 'US Legal (8.5 × 14 in)', w: 215.9, h: 355.6 },
  { id: 'A0', label: 'DIN A0 (copy shop, 841 × 1189 mm)', w: 841, h: 1189 },
];

export const pageSize = (id: PageSizeId) => PAGE_SIZES.find((p) => p.id === id) ?? PAGE_SIZES[0];

/** Non-printable border kept on every page, in cm. */
export const PAGE_MARGIN = 0.8;
/** Gap between pieces sharing a page, in cm. */
const GAP = 1;
const FIT_EPS = 1e-6;

export interface Placed {
  piece: Piece;
  x: number;
  y: number;
}

export interface Tile {
  col: number;
  row: number;
  /** Position within the sheet, e.g. "A1". */
  label: string;
  used: boolean;
  x: number;
  y: number;
}

/** A group of pages printed together: one piece (or all of them), possibly tiled. */
export interface Sheet {
  title: string;
  placed: Placed[];
  landscape: boolean;
  cols: number;
  rows: number;
  tileW: number;
  tileH: number;
  tiles: Tile[];
  usedTiles: Tile[];
  /** Top-left corner of the 5 x 5 cm test square, in sheet coordinates, if this sheet carries it. */
  testSquare?: Pt;
}

export interface Layout {
  sheets: Sheet[];
  pageCount: number;
  /** Factor applied when drawing on paper (100 / printer scale %). */
  scale: number;
}

export const tileLabel = (col: number, row: number) => `${rowName(row)}${col + 1}`;

/** The name printed on a page: the sheet title, plus the tile when a sheet spans pages. */
export const pageName = (sheet: Sheet, tile: Tile) =>
  sheet.usedTiles.length > 1 ? `${sheet.title} ${tile.label}` : sheet.title;

function rowName(row: number): string {
  let s = '';
  let r = row;
  do {
    s = String.fromCharCode(65 + (r % 26)) + s;
    r = Math.floor(r / 26) - 1;
  } while (r >= 0);
  return s;
}

const tileSize = (page: PageSize, landscape: boolean) => ({
  tileW: (landscape ? page.h : page.w) / 10 - 2 * PAGE_MARGIN,
  tileH: (landscape ? page.w : page.h) / 10 - 2 * PAGE_MARGIN,
});

/**
 * Rotations to try, in degrees within (-90, 90]: upright and sideways first,
 * then progressively larger tilts away from those.
 */
const ROTATIONS: number[] = (() => {
  const out = [0, 90];
  for (let d = 1; d < 45; d++) out.push(d, -d, 90 - d, -90 + d);
  out.push(45, -45);
  return out;
})();

// --- Tiling ------------------------------------------------------------------

/** Resample a closed polygon so no segment is longer than `step`. */
function densify(poly: Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / step));
    for (let j = 0; j < n; j++) out.push({ x: p.x + ((q.x - p.x) * j) / n, y: p.y + ((q.y - p.y) * j) / n });
  }
  return out;
}

function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function tileUsed(tx: number, ty: number, tw: number, th: number, shapes: Pt[][]): boolean {
  const inTile = (p: Pt) => p.x >= tx && p.x <= tx + tw && p.y >= ty && p.y <= ty + th;
  const corners = [
    { x: tx, y: ty },
    { x: tx + tw, y: ty },
    { x: tx, y: ty + th },
    { x: tx + tw, y: ty + th },
  ];
  return shapes.some((poly) => poly.some(inTile) || corners.some((c) => pointInPolygon(c, poly)));
}

function makeSheet(
  title: string,
  placed: Placed[],
  landscape: boolean,
  tileW: number,
  tileH: number,
  cols: number,
  rows: number,
): Sheet {
  const shapes = placed.map((pl) => densify(pl.piece.cut.map((p) => ({ x: p.x + pl.x, y: p.y + pl.y })), 0.5));
  const tiles: Tile[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * tileW;
      const y = row * tileH;
      tiles.push({ col, row, x, y, label: tileLabel(col, row), used: tileUsed(x, y, tileW, tileH, shapes) });
    }
  }
  return { title, placed, landscape, cols, rows, tileW, tileH, tiles, usedTiles: tiles.filter((t) => t.used) };
}

/** A single piece centred on its own grid of pages. */
function pieceSheet(piece: Piece, page: PageSize, landscape: boolean): Sheet {
  const { tileW, tileH } = tileSize(page, landscape);
  const cols = Math.max(1, Math.ceil((piece.width - FIT_EPS) / tileW));
  const rows = Math.max(1, Math.ceil((piece.height - FIT_EPS) / tileH));
  const slackX = cols * tileW - piece.width;
  const slackY = rows * tileH - piece.height;
  let x = slackX / 2;
  let y = slackY / 2;
  if (cols * rows > 1) {
    // Slide the piece within the spare paper so its label sits as far as
    // possible from the page joins, while staying as centred as possible.
    const clearance = (v: number, size: number, n: number) => {
      if (n === 1) return Infinity;
      const r = ((v % size) + size) % size;
      return Math.min(r, size - r);
    };
    let best = -Infinity;
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; j <= steps; j++) {
        const ox = (slackX * i) / steps;
        const oy = (slackY * j) / steps;
        const lx = piece.labelAt.x + ox;
        const ly = piece.labelAt.y + oy;
        const c = Math.min(clearance(lx, tileW, cols), clearance(ly, tileH, rows), 6);
        const score = c - 0.01 * (Math.abs(ox - slackX / 2) + Math.abs(oy - slackY / 2));
        if (score > best) {
          best = score;
          x = ox;
          y = oy;
        }
      }
    }
  }
  return makeSheet(piece.title, [{ piece, x, y }], landscape, tileW, tileH, cols, rows);
}

// --- Strategies ----------------------------------------------------------------

/** Try to pack all pieces onto a single page (shelf packing, tallest first). */
function singlePage(pieces: Piece[], page: PageSize): Sheet | undefined {
  for (const landscape of [false, true]) {
    const { tileW, tileH } = tileSize(page, landscape);
    const sorted = [...pieces].sort((a, b) => b.height - a.height);
    const placed: Placed[] = [];
    let x = 0;
    let y = 0;
    let shelfH = 0;
    let ok = true;
    for (const piece of sorted) {
      if (x > 0 && x + piece.width > tileW + FIT_EPS) {
        x = 0;
        y += shelfH + GAP;
        shelfH = 0;
      }
      if (piece.width > tileW + FIT_EPS || y + piece.height > tileH + FIT_EPS) {
        ok = false;
        break;
      }
      placed.push({ piece, x, y });
      x += piece.width + GAP;
      shelfH = Math.max(shelfH, piece.height);
    }
    if (ok) return makeSheet('Pattern', placed, landscape, tileW, tileH, 1, 1);
  }
  return undefined;
}

/** First rotation/orientation in which the piece fits on one page, if any. */
function fitOnePage(piece: Piece, page: PageSize): { deg: number; landscape: boolean } | undefined {
  const portrait = tileSize(page, false);
  for (const deg of ROTATIONS) {
    const { w, h } = rotatedSize(piece, deg);
    if (w <= portrait.tileW + FIT_EPS && h <= portrait.tileH + FIT_EPS) return { deg, landscape: false };
    if (w <= portrait.tileH + FIT_EPS && h <= portrait.tileW + FIT_EPS) return { deg, landscape: true };
  }
  return undefined;
}

/** Best tiling for a piece that doesn't fit on one page: fewest printed pages. */
function bestTiled(piece: Piece, page: PageSize): Sheet {
  // Upright, sideways, and the tightest bounding box (plus its sideways twin).
  let tight = 0;
  let tightArea = Infinity;
  for (const deg of ROTATIONS) {
    const { w, h } = rotatedSize(piece, deg);
    if (w * h < tightArea - FIT_EPS) {
      tightArea = w * h;
      tight = deg;
    }
  }
  const candidates = [...new Set([0, 90, tight, tight > 0 ? tight - 90 : tight + 90])];
  let best: Sheet | undefined;
  for (const deg of candidates) {
    const rotated = rotatePiece(piece, deg);
    for (const landscape of [false, true]) {
      const sheet = pieceSheet(rotated, page, landscape);
      if (!best || sheet.usedTiles.length < best.usedTiles.length) best = sheet;
    }
  }
  return best!;
}

// --- Test square ---------------------------------------------------------------

/** Side of the test square printed on a pattern page, in cm. */
export const TEST_SQUARE = 5;
/** Clear space kept between the test square and any piece, in cm. */
const SQUARE_CLEARANCE = 0.5;
/** Inset of the test square from the page's printable corner, in cm. */
const SQUARE_INSET = 0.3;

/** Where a test square fits in a free corner of one of the sheet's pages, if anywhere. */
function freeCorner(sheet: Sheet): Pt | undefined {
  const shapes = sheet.placed.map((pl) => densify(pl.piece.cut.map((p) => ({ x: p.x + pl.x, y: p.y + pl.y })), 0.25));
  const s = TEST_SQUARE;
  const c = SQUARE_CLEARANCE;
  for (const t of sheet.usedTiles) {
    const near = SQUARE_INSET;
    const farX = sheet.tileW - SQUARE_INSET - s;
    const farY = sheet.tileH - SQUARE_INSET - s;
    // Bottom corners first: pieces are centred, and the page name is at the top.
    const corners: [number, number][] = [[farX, farY], [near, farY], [farX, near], [near, near]];
    for (const [dx, dy] of corners) {
      const x = t.x + dx;
      const y = t.y + dy;
      const hits = (p: Pt) => p.x >= x - c && p.x <= x + s + c && p.y >= y - c && p.y <= y + s + c;
      const box = [{ x, y }, { x: x + s, y }, { x, y: y + s }, { x: x + s, y: y + s }];
      if (!shapes.some((poly) => poly.some(hits) || box.some((b) => pointInPolygon(b, poly)))) return { x, y };
    }
  }
  return undefined;
}

/** Put the test square on the first pattern page with a free corner. */
function placeTestSquare(sheets: Sheet[]) {
  for (const sheet of sheets) {
    const at = freeCorner(sheet);
    if (at) {
      sheet.testSquare = at;
      return;
    }
  }
}

/**
 * `scale` enlarges everything on paper to correct a printer that shrinks
 * (e.g. 100/98). Layout works in true centimetres, so the usable paper is
 * correspondingly smaller.
 */
export function layoutPieces(pieces: Piece[], paper: PageSize, scale = 1): Layout {
  const page: PageSize = { ...paper, w: paper.w / scale, h: paper.h / scale };
  // Everything on one page, each piece in its best single-page rotation.
  const upright = pieces.map((p) => {
    const fit = fitOnePage(p, page);
    return fit ? rotatePiece(p, fit.deg) : p;
  });
  const together = singlePage(upright, page) ?? singlePage(pieces, page);
  if (together && pieces.length > 1) {
    placeTestSquare([together]);
    return { sheets: [together], pageCount: 1, scale };
  }

  const sheets = pieces.map((piece) => {
    const fit = fitOnePage(piece, page);
    return fit ? pieceSheet(rotatePiece(piece, fit.deg), page, fit.landscape) : bestTiled(piece, page);
  });
  placeTestSquare(sheets);
  return { sheets, pageCount: sheets.reduce((n, s) => n + s.usedTiles.length, 0), scale };
}
