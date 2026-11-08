import type { Pattern } from './geometry';

/** Step-by-step sewing instructions for the generated pattern. */
export function assemblySteps(pattern: Pattern): string[] {
  const { panels: n, fold, seam, onFold, circular } = pattern.params;
  const sa = `${seam} cm`;
  const extraNotches = circular && n < 4;
  const join =
    n === 1
      ? 'Fold the outer side panel right sides together and sew the side seam to make a tube.'
      : `Sew the ${n} outer side panels together along their side seams, right sides facing, to make a tube.`;
  const steps = [
    `All pieces include a ${sa} seam allowance: sew along the dashed line. Snip the notches about 5 mm into the seam allowance and mark the cuff edge line.` +
      (extraNotches
        ? ' The long curved edges have extra notches, spaced evenly, so the cuff, side panels and base line up all the way round.'
        : ''),
    join,
    'Pin the outer base to the bottom of the tube, right sides together, matching the notches on the base to the side seams and the notches on the panels. Sew, then clip the curved seam allowance.',
    `Make the lining the same way, but leave a 10 cm gap in one side seam for turning.`,
  ];
  if (onFold) {
    steps.splice(
      1,
      0,
      'Cutting on the fold: fold the fabric along the grain and put the PLACE ON FOLD edge on the fold. Snip the notches while the fabric is still folded so they are mirrored on both halves. Then snip a small notch at each end of the fold, top and bottom, through both layers: those mark the centre front, which you would otherwise lose when you open the piece out.',
    );
  }
  if (fold > 0) {
    steps.splice(
      onFold ? 2 : 1,
      0,
      'The cuff is a separate piece, so you can cut it (and its lining) with a directional print the right way up: the top of every piece is the top edge as printed (where the label reads upright).',
    );
    steps.push(
      `Sew the cuff panels into a ring, and the cuff lining panels into a second ring. Place them right sides together, matching seams and notches, and sew along the lower edge. Turn right side out, press, and baste the top edges together.`,
      'With the outer shell right side out, slide the cuff over it so the cuff hangs down in its finished position, top edges level. Match the cuff seams and notches to those on the shell, then baste around the top.',
    );
  }
  steps.push(
    `Slip the outer shell${fold > 0 ? ' (with cuff)' : ''} inside the lining, right sides together, top edges level, side seams and notches matched. Sew all around the top edge.`,
    'Turn the cover right side out through the gap in the lining, close the gap, push the lining down inside and press the top edge. Topstitch close to the top if you like.',
  );
  return steps;
}
