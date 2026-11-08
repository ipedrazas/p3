import type { Pattern } from './geometry';

/** Step-by-step sewing instructions for the generated pattern. */
export function assemblySteps(pattern: Pattern): string[] {
  const { panels: n, fold, seam, onFold } = pattern.params;
  const sa = `${seam} cm`;
  const join =
    n === 1
      ? 'Fold the outer side panel right sides together and sew the side seam to make a tube.'
      : `Sew the ${n} outer side panels together along their side seams, right sides facing, to make a tube.`;
  const steps = [
    `All pieces include a ${sa} seam allowance: sew along the dashed line. Transfer the notches and the cuff edge line.` +
      (onFold
        ? ' Pieces marked PLACE ON FOLD are half pieces: fold the fabric along the grain, put that edge on the fold and cut through both layers. The crease marks the centre.'
        : ''),
    join,
    'Pin the outer base to the bottom of the tube, right sides together, matching the notches to the side seams. Sew, then clip or notch the curved seam allowance.',
    `Make the lining the same way, but leave a 10 cm gap in one side seam for turning.`,
  ];
  if (fold > 0) {
    steps.splice(
      1,
      0,
      'The cuff is a separate piece, so you can cut it (and its lining) with a directional print the right way up: the top of every piece is the top edge as printed (where the label reads upright).',
    );
    steps.push(
      `Sew the cuff panels into a ring, and the cuff lining panels into a second ring. Place them right sides together and sew along the lower (narrower) edge. Turn right side out, press, and baste the top edges together.`,
      'With the outer shell right side out, slide the cuff over it so the cuff hangs down in its finished position, top edges level. Baste around the top.',
    );
  }
  steps.push(
    `Slip the outer shell${fold > 0 ? ' (with cuff)' : ''} inside the lining, right sides together, top edges level and side seams matched. Sew all around the top edge.`,
    'Turn the cover right side out through the gap in the lining, close the gap, push the lining down inside and press the top edge. Topstitch close to the top if you like.',
  );
  return steps;
}
