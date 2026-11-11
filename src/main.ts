import { buildPattern, DEFAULTS, type PageSizeId, type Params, validate } from './geometry';
import { FIGURE_NOTE, figureSvg } from './figures';
import { assemblySteps } from './instructions';
import { layoutPieces, PAGE_SIZES, pageSize } from './layout';
import { sectionSvg, sheetSvg } from './preview';

const NUMERIC = ['top', 'base', 'height', 'fold', 'seam', 'ease', 'panels', 'printScale'] as const;

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;
const form = $<HTMLFormElement>('#form');
const field = <T extends Element = HTMLInputElement>(name: string) => form.elements.namedItem(name) as unknown as T;

const select = field<HTMLSelectElement>('pageSize');
for (const p of PAGE_SIZES) select.add(new Option(p.label, p.id));

// --- State <-> URL hash, so a pattern can be bookmarked or shared ----------

function fromHash(): Params {
  const q = new URLSearchParams(location.hash.slice(1));
  const p: Params = { ...DEFAULTS };
  for (const k of NUMERIC) {
    const v = q.get(k);
    if (v !== null && v !== '' && Number.isFinite(Number(v))) p[k] = Number(v);
  }
  const m = q.get('measure');
  if (m === 'radius' || m === 'diameter') p.measure = m;
  if (q.has('onFold')) p.onFold = q.get('onFold') === '1';
  if (q.get('circular') === '0') p.circular = false;
  const ps = q.get('pageSize');
  if (PAGE_SIZES.some((x) => x.id === ps)) p.pageSize = ps as PageSizeId;
  return p;
}

function toHash(p: Params) {
  const q = new URLSearchParams();
  for (const k of NUMERIC) q.set(k, String(p[k]));
  q.set('measure', p.measure);
  q.set('circular', p.circular ? '1' : '0');
  q.set('onFold', p.onFold ? '1' : '0');
  q.set('pageSize', p.pageSize);
  history.replaceState(null, '', `#${q}`);
}

function writeForm(p: Params) {
  for (const k of NUMERIC) field(k).value = String(p[k]);
  for (const r of form.querySelectorAll<HTMLInputElement>('input[name=measure]')) r.checked = r.value === p.measure;
  field('circular').checked = p.circular;
  field('onFold').checked = p.onFold;
  select.value = p.pageSize;
}

function readForm(): Params {
  const p = { ...DEFAULTS };
  for (const k of NUMERIC) {
    const raw = field(k).value.trim();
    p[k] = raw === '' ? NaN : Number(raw);
  }
  p.measure = form.querySelector<HTMLInputElement>('input[name=measure]:checked')?.value === 'diameter' ? 'diameter' : 'radius';
  p.circular = field('circular').checked;
  p.onFold = field('onFold').checked;
  p.pageSize = select.value as PageSizeId;
  return p;
}

// --- Rendering ---------------------------------------------------------------

const cm = (v: number) => `${(Math.round(v * 10) / 10).toLocaleString()} cm`;
let current: Params | null = null;

function render() {
  const p = readForm();
  const word = p.measure === 'diameter' ? 'diameter' : 'radius';
  $('[data-measure-label]').textContent = `Top ${word}`;
  $('[data-measure-label-base]').textContent = `Base ${word}`;

  const errors = validate(p);
  const errorList = $<HTMLUListElement>('#errors');
  errorList.hidden = errors.length === 0;
  errorList.innerHTML = errors.map((e) => `<li>${e.message}</li>`).join('');
  $<HTMLButtonElement>('#download').disabled = errors.length > 0;
  for (const k of NUMERIC) field(k).setAttribute('aria-invalid', String(errors.some((e) => e.field === k)));
  if (errors.length) {
    current = null;
    return;
  }

  current = p;
  toHash(p);
  const pattern = buildPattern(p);
  const page = pageSize(p.pageSize);
  const layout = layoutPieces(pattern.pieces, page, 100 / p.printScale);
  const s = pattern.summary;

  const n = layout.pageCount;
  const tiled = layout.sheets.some((sh) => sh.usedTiles.length > 1);
  $('#pages').textContent =
    `${n} pattern page${n === 1 ? '' : 's'} on ${page.id}` +
    (tiled ? ' (some pieces span several pages)' : ', no taping needed') +
    ', plus an info page and the sewing instructions.';
  const stats: [string, string][] = [
    ['Top circumference', cm(s.topCircumference)],
    ['Base circumference', cm(s.baseCircumference)],
    ['Wall height (slant)', cm(s.slant)],
    ['Pieces', pattern.pieces.map((x) => x.title).join(', ')],
  ];
  $('#stats').innerHTML = stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  $('#sheet').innerHTML = layout.sheets
    .map(
      (sh, i) =>
        // Grow in proportion to the paper width so every card shares one scale.
        `<figure class="sheet-card" style="flex: ${(sh.cols * sh.tileW).toFixed(1)} 1 0">${sheetSvg(sh, i)}<figcaption>${sh.title}<span>${sh.usedTiles.length} page${sh.usedTiles.length === 1 ? '' : 's'}${sh.placed.some((p) => p.piece.rotation !== 0) ? ' · rotated to fit' : ''}</span></figcaption></figure>`,
    )
    .join('');
  $('#section').innerHTML = sectionSvg(p, pattern);
  let noted = false;
  $('#steps').innerHTML = assemblySteps(pattern)
    .map((st) => {
      if (!st.figures) return `<li>${st.text}</li>`;
      // Explain the drawing convention once, under the first illustrations.
      const note = noted ? '' : `<p class="fig-note">${FIGURE_NOTE}</p>`;
      noted = true;
      return `<li>${st.text}<div class="figs">${st.figures.map(figureSvg).join('')}</div>${note}</li>`;
    })
    .join('');
}

// Switching radius/diameter keeps the same pot by converting the values.
let lastMeasure = fromHash().measure;
form.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.name === 'measure' && t.value !== lastMeasure) {
    const f = t.value === 'diameter' ? 2 : 0.5;
    for (const k of ['top', 'base'] as const) {
      const v = Number(field(k).value);
      if (field(k).value !== '' && Number.isFinite(v)) field(k).value = String(Math.round(v * f * 100) / 100);
    }
    lastMeasure = t.value as Params['measure'];
  }
  render();
});
form.addEventListener('input', render);

$('#reset').addEventListener('click', () => {
  writeForm(DEFAULTS);
  lastMeasure = DEFAULTS.measure;
  render();
});

$('#download').addEventListener('click', async () => {
  if (!current) return;
  const btn = $<HTMLButtonElement>('#download');
  btn.disabled = true;
  btn.textContent = 'Building PDF…';
  try {
    const { buildPdf } = await import('./pdf');
    const pattern = buildPattern(current);
    const page = pageSize(current.pageSize);
    const doc = buildPdf(pattern, layoutPieces(pattern.pieces, page, 100 / current.printScale), page);
    const unit = current.measure === 'diameter' ? 'd' : 'r';
    doc.save(`plant-pot-cover-${unit}${current.top}-${current.base}-h${current.height}-${page.id}.pdf`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Download PDF pattern';
  }
});

writeForm(fromHash());
render();
