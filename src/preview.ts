// SVG previews for the browser. Units in the SVG user space are centimetres.

import type { Params, Pattern, Pt } from './geometry';
import { type Sheet, TEST_SQUARE } from './layout';
import { foldMark } from './marks';

const path = (pts: Pt[], closed: boolean) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join('') + (closed ? 'Z' : '');

/** One typographic point in centimetres (the SVG user unit). */
const PT_CM = 2.54 / 72;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** One sheet (a piece, or all pieces) on its printer page(s). */
export function sheetSvg(sheet: Sheet, index: number): string {
  const W = sheet.cols * sheet.tileW;
  const H = sheet.rows * sheet.tileH;
  const multi = sheet.usedTiles.length > 1;
  const arrow = `arrow-${index}`;
  const tiles = sheet.tiles
    .map(
      (t) =>
        `<rect class="tile${t.used ? '' : ' empty'}" x="${t.x}" y="${t.y}" width="${sheet.tileW}" height="${sheet.tileH}"/>` +
        (t.used && multi ? `<text class="tile-label" x="${t.x + 0.6}" y="${t.y + 1.6}">${t.label}</text>` : ''),
    )
    .join('');
  const pieces = sheet.placed
    .map(({ piece, x, y }) => {
      const notches = piece.notches.map(([a, b]) => `M${a.x} ${a.y}L${b.x} ${b.y}`).join('');
      const guides = piece.guides.map((g) => `<path class="guide" d="${path(g.pts, false)}"/>`).join('');
      const [g0, g1] = piece.grain;
      let gAngle = (Math.atan2(g1.y - g0.y, g1.x - g0.x) * 180) / Math.PI;
      if (gAngle > 90) gAngle -= 180;
      if (gAngle <= -90) gAngle += 180;
      const grain = `<path class="grain" d="M${g0.x} ${g0.y}L${g1.x} ${g1.y}" marker-start="url(#${arrow})" marker-end="url(#${arrow})"/>
        <text class="grain-label" transform="translate(${(g0.x + g1.x) / 2} ${(g0.y + g1.y) / 2}) rotate(${gAngle})" y="-0.15">GRAIN</text>`;
      const mark = foldMark(piece);
      const fold = mark
        ? `<path class="fold" d="${path(mark.line, false)}"/>
          <path class="fold-bracket" d="${path(mark.bracket, false)}" marker-start="url(#${arrow})" marker-end="url(#${arrow})"/>
          <text class="fold-label" transform="translate(${mark.textAt.x} ${mark.textAt.y}) rotate(${mark.textAngle})">PLACE ON FOLD</text>`
        : '';
      const closed = !piece.fold;
      // Same sizes as the PDF (see drawPiece), so the preview shows what prints.
      const small = Math.min(piece.width, piece.height) < 12;
      const pt = small ? 7.5 : 9;
      const line = pt * PT_CM * 1.3;
      const label = `<g class="label" style="--pt: ${(pt * PT_CM).toFixed(4)}px" transform="translate(${piece.labelAt.x} ${piece.labelAt.y}) rotate(${piece.rotation})">
          <text class="piece-title" y="${-line * 0.6}">${esc(piece.title)}</text>
          ${piece.cutting.map((c, i) => `<text class="piece-cut" y="${line * (0.6 + i)}">${esc(c)}</text>`).join('')}
        </g>`;
      return `<g transform="translate(${x} ${y})">
        <path class="cut-fill" d="${path(piece.cut, true)}"/>
        <path class="cut" d="${path(piece.cut, closed)}"/>
        <path class="stitch" d="${path(piece.stitch, closed)}"/>
        ${guides}
        <path class="notch" d="${notches}"/>
        ${grain}${fold}${label}
      </g>`;
    })
    .join('');
  const sq = sheet.testSquare;
  const square = sq
    ? `<g class="test-square"><rect x="${sq.x}" y="${sq.y}" width="${TEST_SQUARE}" height="${TEST_SQUARE}"/>
        <text x="${sq.x + TEST_SQUARE / 2}" y="${sq.y + TEST_SQUARE / 2}">5 × 5 cm</text></g>`
    : '';
  return `<svg viewBox="-0.2 -0.2 ${W + 0.4} ${H + 0.4}" role="img" aria-label="${esc(sheet.title)} on ${sheet.usedTiles.length} printed page(s)">
    <defs><marker id="${arrow}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M0 0L10 5L0 10" class="arrowhead"/></marker></defs>
    ${tiles}${square}${pieces}</svg>`;
}

/** A cross-section of the pot (grey) and the cover around it. */
export function sectionSvg(p: Params, pattern: Pattern): string {
  const k = p.measure === 'diameter' ? 0.5 : 1;
  const rt = p.top * k;
  const rb = p.base * k;
  const { topRadius: RT, baseRadius: RB } = pattern.summary;
  const h = p.height;
  const R = Math.max(RT, RB) + 1.5;
  const pad = 1.5;
  const y = (z: number) => h - z;
  const potPath = `M${-rb} ${y(0)}L${-rt} ${y(h)}L${rt} ${y(h)}L${rb} ${y(0)}Z`;
  const wall = (s: number) => `M${s * RT} ${y(h)}L${s * RB} ${y(0)}`;
  const cover = `${wall(-1)}L${RB} ${y(0)}L${RT} ${y(h)}`;
  let cuff = '';
  if (p.fold > 0) {
    const zc = h - p.fold;
    const rc = RB + ((RT - RB) * zc) / h + 1;
    cuff = `<path class="sec-cuff" d="M${-RT} ${y(h)}L${-rc} ${y(zc)}M${RT} ${y(h)}L${rc} ${y(zc)}"/>`;
  }
  return `<svg viewBox="${-R - pad} ${-pad} ${2 * (R + pad)} ${h + 2 * pad}" role="img" aria-label="Cross-section">
    <path class="sec-pot" d="${potPath}"/>
    <path class="sec-cover" d="${cover}"/>${cuff}
  </svg>`;
}
