// Code 128 (set B) barcodes for printed tags (Phase 3A). Set B covers the
// printable ASCII characters, which is all a job number like "J1042" needs.
//
// Each symbol is six alternating bar and space widths (in modules, starting
// with a bar); the stop symbol has seven. A barcode is: start B, the
// characters, a check symbol, stop, with a quiet zone either side.

/** Bar/space widths for symbols 0–106 (103–105 are start A/B/C, 106 is stop). */
export const CODE128_PATTERNS: readonly string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const START_B = 104;
const STOP = 106;
/** Blank modules either side, so a scanner finds the edges. */
export const QUIET_ZONE = 10;

/** The symbol values for `text` in set B: start, characters, check, stop. */
export function code128Values(text: string): number[] {
  if (!text) throw new Error('Nothing to encode');
  const values = [START_B];
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (char.length !== 1 || code < 32 || code > 126) {
      throw new Error(`"${char}" can't be printed in a Code 128 barcode`);
    }
    values.push(code - 32);
  }
  const check = values.reduce((sum, value, index) => sum + value * Math.max(index, 1), 0) % 103;
  return [...values, check, STOP];
}

export interface Bar {
  /** Distance from the left edge, in modules (quiet zone included). */
  x: number;
  width: number;
}

/** The black bars for `text`, and the barcode's full width in modules. */
export function code128Bars(text: string): { bars: Bar[]; width: number } {
  const bars: Bar[] = [];
  let x = QUIET_ZONE;
  for (const value of code128Values(text)) {
    const pattern = CODE128_PATTERNS[value];
    for (let i = 0; i < pattern.length; i += 1) {
      const width = Number(pattern[i]);
      if (i % 2 === 0) bars.push({ x, width });
      x += width;
    }
  }
  return { bars, width: x + QUIET_ZONE };
}
