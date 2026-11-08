// Vector PDF output: an information page, instructions, then pattern pages
// printed at 100% scale. jsPDF works in millimetres here; geometry is in cm.

import { jsPDF } from 'jspdf';
import type { Pattern, Piece, Pt } from './geometry';
import { assemblySteps } from './instructions';
import { type Layout, type PageSize, PAGE_MARGIN, pageName, type Sheet, tileLabel } from './layout';
import { along, foldMark } from './marks';

type ToMm = (p: Pt) => [number, number];

const fmt = (v: number) => `${Math.round(v * 10) / 10} cm`;

function polyline(doc: jsPDF, pts: Pt[], toMm: ToMm, closed: boolean) {
  if (pts.length < 2) return;
  const m = pts.map(toMm);
  const deltas = m.slice(1).map((p, i) => [p[0] - m[i][0], p[1] - m[i][1]]);
  doc.lines(deltas, m[0][0], m[0][1], [1, 1], 'S', closed);
}

function arrowHead(doc: jsPDF, tip: [number, number], from: [number, number], size: number) {
  const dx = tip[0] - from[0];
  const dy = tip[1] - from[1];
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  for (const s of [1, -1]) {
    doc.line(tip[0], tip[1], tip[0] - ux * size + s * uy * size * 0.5, tip[1] - uy * size - s * ux * size * 0.5);
  }
}

function drawPiece(doc: jsPDF, piece: Piece, toMm: ToMm) {
  // Smaller text on narrow pieces (e.g. a half base cut on the fold).
  const labelPt = Math.min(piece.width, piece.height) < 12 ? 7.5 : 9;
  doc.setDrawColor(0);
  doc.setTextColor(0);

  // Cut line
  doc.setLineWidth(0.4);
  doc.setLineDashPattern([], 0);
  polyline(doc, piece.cut, toMm, !piece.fold);

  // Notches
  for (const [a, b] of piece.notches) {
    const [ax, ay] = toMm(a);
    const [bx, by] = toMm(b);
    doc.line(ax, ay, bx, by);
  }

  // Stitch line
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([2, 1.2], 0);
  polyline(doc, piece.stitch, toMm, !piece.fold);

  // Guides (e.g. cuff placement)
  doc.setDrawColor(90);
  doc.setLineDashPattern([5, 1.2, 0.8, 1.2], 0);
  for (const g of piece.guides) {
    polyline(doc, g.pts, toMm, false);
    if (g.label) {
      const mid = toMm(g.pts[Math.floor(g.pts.length / 2)]);
      doc.setFontSize(7);
      doc.setTextColor(90);
      doc.text(g.label, mid[0], mid[1] - 1, { align: 'center' });
    }
  }
  doc.setDrawColor(0);
  doc.setTextColor(0);

  // Grainline
  doc.setLineDashPattern([], 0);
  doc.setLineWidth(0.25);
  const g0 = toMm(piece.grain[0]);
  const g1 = toMm(piece.grain[1]);
  doc.line(g0[0], g0[1], g1[0], g1[1]);
  arrowHead(doc, g0, g1, 3);
  arrowHead(doc, g1, g0, 3);
  textAlong(doc, 'GRAIN', piece.grain, toMm, 7);

  drawFold(doc, piece, toMm);

  // Label, rotated with the piece.
  const angle = piece.rotation;
  const line = labelPt * 0.0353 * 1.3; // line height in cm
  centredText(doc, piece.title, along(piece.labelAt, angle, 0, -line * 0.6), angle, labelPt + 2, 'bold', toMm);
  piece.cutting.forEach((text, i) =>
    centredText(doc, text, along(piece.labelAt, angle, 0, line * (0.6 + i)), angle, labelPt, 'normal', toMm),
  );
}

/** Text centred on `at` (cm), turned by `angle` degrees clockwise. */
function centredText(
  doc: jsPDF,
  text: string,
  at: Pt,
  angle: number,
  size: number,
  weight: 'bold' | 'normal',
  toMm: ToMm,
) {
  doc.setFont('helvetica', weight);
  doc.setFontSize(size);
  const wCm = doc.getTextWidth(text) / 10;
  const [x, y] = toMm(along(at, angle, -wCm / 2, 0));
  doc.text(text, x, y, { angle: -angle });
}

/** Small label written alongside a segment (e.g. the grainline), centred on it. */
function textAlong(doc: jsPDF, text: string, seg: [Pt, Pt], toMm: ToMm, size: number) {
  const [a, b] = seg;
  let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle <= -90) angle += 180;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  centredText(doc, text, along(mid, angle, 0, -0.15), angle, size, 'normal', toMm);
}

/** "Place on fold" edge: long-dash line plus the usual bracket with arrows. */
function drawFold(doc: jsPDF, piece: Piece, toMm: ToMm) {
  const mark = foldMark(piece);
  if (!mark) return;
  const [a, b] = mark.line.map(toMm);
  doc.setLineWidth(0.5);
  doc.setLineDashPattern([6, 2], 0);
  doc.line(a[0], a[1], b[0], b[1]);
  doc.setLineDashPattern([], 0);
  doc.setLineWidth(0.3);
  const [t1, q1, q2, t2] = mark.bracket.map(toMm);
  doc.line(t1[0], t1[1], q1[0], q1[1]);
  doc.line(q1[0], q1[1], q2[0], q2[1]);
  doc.line(q2[0], q2[1], t2[0], t2[1]);
  arrowHead(doc, t1, q1, 2.5);
  arrowHead(doc, t2, q2, 2.5);
  centredText(doc, 'PLACE ON FOLD', mark.textAt, mark.textAngle, 9, 'bold', toMm);
  doc.setFont('helvetica', 'normal');
}

function infoPage(doc: jsPDF, pattern: Pattern, layout: Layout, page: PageSize) {
  const p = pattern.params;
  const s = pattern.summary;
  const left = 15;
  const right = page.w - 15;
  let y = 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Plant pot cover pattern', left, y);
  y += 10;

  // 5 x 5 cm test square, top right.
  const sq = 50;
  const sx = right - sq;
  const sy = y + 2;
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([], 0);
  doc.rect(sx, sy, sq, sq, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('5 x 5 cm', sx + sq / 2, sy + sq / 2 - 1, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('test square', sx + sq / 2, sy + sq / 2 + 4, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Print at 100% ("actual size").', left, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('The ruler must measure 10 cm and the square 5 x 5 cm.', left, y);
  y += 4;
  // 10 cm ruler
  doc.setLineWidth(0.3);
  doc.setDrawColor(0);
  doc.line(left, y + 4, left + 100, y + 4);
  for (let i = 0; i <= 100; i++) {
    const tick = i % 10 === 0 ? 4 : i % 5 === 0 ? 2.5 : 1.2;
    doc.setLineWidth(i % 10 === 0 ? 0.3 : 0.15);
    doc.line(left + i, y + 4, left + i, y + 4 - tick);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  for (let c = 0; c <= 10; c++) doc.text(String(c), left + c * 10, y + 8, { align: 'center' });
  y += 16;

  const unit = p.measure === 'diameter' ? 'diameter' : 'radius';
  const rows: [string, string][] = [
    [`Pot top (${unit})`, fmt(p.top)],
    [`Pot base (${unit})`, fmt(p.base)],
    ['Pot height', fmt(p.height)],
    ['Fold (cuff height)', p.fold > 0 ? fmt(p.fold) : 'no cuff'],
    ['Seam allowance', fmt(p.seam)],
    ['Ease', fmt(p.ease)],
    ['Cut on fold', p.onFold ? 'yes (half pieces)' : 'no (full pieces)'],
    ['Construction', `${p.panels} side panel${p.panels === 1 ? '' : 's'}, ${p.circular ? 'round' : `${p.panels}-sided`} base`],
    ['Finished top circumference', fmt(s.topCircumference)],
    ['Finished base circumference', fmt(s.baseCircumference)],
    ['Finished wall (slant) height', fmt(s.slant)],
  ];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Measurements', left, y);
  y += 6;
  doc.setFontSize(10);
  for (const [k, v] of rows) {
    doc.setFont('helvetica', 'normal');
    doc.text(k, left, y);
    doc.setFont('helvetica', 'bold');
    doc.text(v, left + 65, y);
    y += 5;
  }
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Cutting list', left, y);
  y += 6;
  doc.setFontSize(10);
  for (const piece of pattern.pieces) {
    doc.setFont('helvetica', 'bold');
    doc.text(piece.title, left, y);
    doc.setFont('helvetica', 'normal');
    doc.text(piece.cutting.join(', '), left + 35, y);
    y += 5;
  }
  y += 4;

  // Page map
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Pattern pages (${layout.pageCount})`, left, y);
  y += 3;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const tiled = layout.sheets.some((sh) => sh.usedTiles.length > 1);
  const note =
    'Each piece is printed on its own page' +
    (layout.sheets.length === 1 && layout.sheets[0].placed.length > 1 ? ' (here all pieces fit on one page)' : '') +
    '. Pieces may be turned to fit the paper: follow the grainline arrow, not the page edge.' +
    (tiled
      ? ' Pieces that span several pages: trim the left and top margins where there is a neighbouring page, overlap so the border lines meet and the half-diamonds form whole diamonds, and tape.'
      : ' No taping needed.');
  const noteLines = doc.splitTextToSize(note, right - left);
  doc.text(noteLines, left, y + 4);
  y += 6 + noteLines.length * 4;

  // Thumbnails of each sheet, side by side, at a common scale.
  const gap = 8;
  const totalW = layout.sheets.reduce((w, sh) => w + sh.cols * sh.tileW, 0);
  const maxH = Math.max(...layout.sheets.map((sh) => sh.rows * sh.tileH));
  const availW = right - left - gap * (layout.sheets.length - 1);
  const availH = page.h - 25 - y;
  const k = Math.min(availW / totalW, availH / maxH, 10);
  let x0 = left;
  for (const sheet of layout.sheets) {
    const toMm: ToMm = (q) => [x0 + q.x * k, y + q.y * k];
    for (const t of sheet.tiles) {
      const [x, ty] = toMm({ x: t.x, y: t.y });
      if (t.used) {
        doc.setDrawColor(0);
        doc.setFillColor(255, 255, 255);
      } else {
        doc.setDrawColor(200);
        doc.setFillColor(235, 235, 235);
      }
      doc.setLineWidth(0.2);
      doc.setLineDashPattern([], 0);
      doc.rect(x, ty, sheet.tileW * k, sheet.tileH * k, 'FD');
    }
    doc.setDrawColor(120);
    doc.setLineWidth(0.15);
    for (const pl of sheet.placed) {
      polyline(doc, pl.piece.cut, (q) => toMm({ x: q.x + pl.x, y: q.y + pl.y }), true);
    }
    doc.setTextColor(0);
    if (sheet.usedTiles.length > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(Math.max(6, Math.min(12, sheet.tileW * k * 0.6)));
      for (const t of sheet.usedTiles) {
        const [x, ty] = toMm({ x: t.x + sheet.tileW / 2, y: t.y + sheet.tileH / 2 });
        doc.text(t.label, x, ty, { align: 'center', baseline: 'middle' });
      }
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const [cx, by] = toMm({ x: (sheet.cols * sheet.tileW) / 2, y: sheet.rows * sheet.tileH });
    doc.text(sheet.title, cx, by + 5, { align: 'center' });
    x0 += sheet.cols * sheet.tileW * k + gap;
  }
}

function instructionsPage(doc: jsPDF, pattern: Pattern, page: PageSize) {
  doc.addPage([page.w, page.h], 'portrait');
  const left = 15;
  const width = page.w - 30;
  let y = 20;
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Sewing instructions', left, y);
  y += 10;
  doc.setFontSize(10);
  assemblySteps(pattern).forEach((step, i) => {
    const lines = doc.splitTextToSize(step, width - 8);
    if (y + lines.length * 5 > page.h - 15) {
      doc.addPage([page.w, page.h], 'portrait');
      y = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.text(`${i + 1}.`, left, y);
    doc.setFont('helvetica', 'normal');
    doc.text(lines, left + 8, y);
    y += lines.length * 5 + 3;
  });

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Legend', left, y);
  y += 7;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const legend: [string, number[], number, number][] = [
    ['Cut line', [], 0.4, 0],
    ['Stitch line', [2, 1.2], 0.2, 0],
    ['Placement guide (cuff edge)', [5, 1.2, 0.8, 1.2], 0.2, 90],
  ];
  for (const [label, dash, w, col] of legend) {
    doc.setDrawColor(col);
    doc.setLineWidth(w);
    doc.setLineDashPattern(dash, 0);
    doc.line(left, y - 1.2, left + 20, y - 1.2);
    doc.text(label, left + 25, y);
    y += 6;
  }
  doc.setDrawColor(0);
  doc.setLineDashPattern([], 0);
  doc.setLineWidth(0.25);
  doc.line(left, y - 1.2, left + 20, y - 1.2);
  arrowHead(doc, [left, y - 1.2], [left + 20, y - 1.2], 3);
  arrowHead(doc, [left + 20, y - 1.2], [left, y - 1.2], 3);
  doc.text('Grainline: place parallel to the selvedge (pieces may be turned on the page)', left + 25, y);
  y += 6;
  doc.setLineWidth(0.5);
  doc.setLineDashPattern([6, 2], 0);
  doc.line(left, y - 1.2, left + 20, y - 1.2);
  doc.setLineDashPattern([], 0);
  doc.text(
    doc.splitTextToSize(
      'Place on fold (bracketed edge): put this edge on the fold of the fabric and cut through both layers. The fold runs along the grain.',
      page.w - left - 40,
    ),
    left + 25,
    y,
  );
  y += 11;
  doc.setLineWidth(0.4);
  doc.line(left + 10, y - 3, left + 10, y);
  doc.text('Notch: match notches when pinning', left + 25, y);
}

function sheetPages(doc: jsPDF, sheet: Sheet, page: PageSize, firstPage: number, totalPages: number) {
  const m = PAGE_MARGIN * 10;
  const tw = sheet.tileW * 10;
  const th = sheet.tileH * 10;
  const pw = sheet.landscape ? page.h : page.w;
  const has = (c: number, r: number) => sheet.usedTiles.some((t) => t.col === c && t.row === r);

  sheet.usedTiles.forEach((t, i) => {
    doc.addPage([page.w, page.h], sheet.landscape ? 'landscape' : 'portrait');
    const toMm: ToMm = (q) => [m + (q.x - t.x) * 10, m + (q.y - t.y) * 10];

    // Pattern content, clipped to the tile.
    doc.saveGraphicsState();
    doc.rect(m, m, tw, th, null);
    doc.clip();
    doc.discardPath();
    for (const pl of sheet.placed) {
      drawPiece(doc, pl.piece, (q) => toMm({ x: q.x + pl.x, y: q.y + pl.y }));
    }
    doc.restoreGraphicsState();

    // Frame.
    doc.setLineDashPattern([], 0);
    doc.setDrawColor(150);
    doc.setLineWidth(0.15);
    doc.rect(m, m, tw, th, 'S');

    // Joining marks, only when the piece spans several pages.
    if (sheet.usedTiles.length > 1) {
      doc.setFillColor(150, 150, 150);
      const d = 5; // half-diamond size
      const neighbours: { c: number; r: number; tri: [number, number][]; text: [number, number] }[] = [
        { c: t.col - 1, r: t.row, tri: [[m, m + th / 2 - d], [m, m + th / 2 + d], [m + d, m + th / 2]], text: [m + d + 2, m + th / 2 + 1.2] },
        { c: t.col + 1, r: t.row, tri: [[m + tw, m + th / 2 - d], [m + tw, m + th / 2 + d], [m + tw - d, m + th / 2]], text: [m + tw - d - 2, m + th / 2 + 1.2] },
        { c: t.col, r: t.row - 1, tri: [[m + tw / 2 - d, m], [m + tw / 2 + d, m], [m + tw / 2, m + d]], text: [m + tw / 2, m + d + 4] },
        { c: t.col, r: t.row + 1, tri: [[m + tw / 2 - d, m + th], [m + tw / 2 + d, m + th], [m + tw / 2, m + th - d]], text: [m + tw / 2, m + th - d - 2] },
      ];
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(120);
      neighbours.forEach((nb, j) => {
        if (!has(nb.c, nb.r)) return;
        const [a, b, c] = nb.tri;
        doc.triangle(a[0], a[1], b[0], b[1], c[0], c[1], 'F');
        const align = j === 0 ? 'left' : j === 1 ? 'right' : 'center';
        doc.text(`join ${tileLabel(nb.c, nb.r)}`, nb.text[0], nb.text[1], { align });
      });
    }

    // Page name in the margin.
    doc.setTextColor(80);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(pageName(sheet, t), m, m - 3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`Page ${firstPage + i} of ${totalPages}  -  print at 100% scale`, pw - m, m - 3, { align: 'right' });
    doc.setTextColor(0);
  });
}

export function buildPdf(pattern: Pattern, layout: Layout, page: PageSize): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: [page.w, page.h], orientation: 'portrait' });
  doc.setProperties({ title: 'Plant pot cover pattern', creator: 'p3 - Plant Pot Patterns' });
  infoPage(doc, pattern, layout, page);
  instructionsPage(doc, pattern, page);
  let n = 1;
  for (const sheet of layout.sheets) {
    sheetPages(doc, sheet, page, n, layout.pageCount);
    n += sheet.usedTiles.length;
  }
  return doc;
}
