/**
 * Minimal, dependency-free Code 128-B encoder.
 *
 * Produces a real, scanner-readable barcode as an SVG string. Code set B covers
 * the full printable ASCII range (space..~), which is enough for member codes
 * such as `A000123` (branch letter + digits).
 */

// The 107 canonical Code 128 symbol patterns (index === symbol value).
// Each string is a run-length list of module widths, alternating bar/space and
// always starting with a bar. Index 106 is the STOP pattern (7 runs, 13 modules).
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112',
];

const START_B = 104;
const STOP = 106;
const QUIET_MODULES = 10; // silent margin required on each side for reliable scans

/** Expand an encoded value list into an array of module widths + colors. */
function toModules(text: string): { runs: number[]; totalModules: number } {
  const values: number[] = [START_B];
  for (const ch of text) {
    const v = ch.charCodeAt(0) - 32;
    // Fall back to space for anything outside Code-B; member codes never hit this.
    values.push(v >= 0 && v <= 94 ? v : 0);
  }

  // Checksum: start value + sum(value * position), positions 1-based over data.
  let sum = START_B;
  for (let i = 1; i < values.length; i++) sum += values[i] * i;
  values.push(sum % 103);
  values.push(STOP);

  const runs: number[] = [];
  for (const v of values) {
    for (const w of PATTERNS[v]) runs.push(Number(w));
  }
  const totalModules = runs.reduce((a, b) => a + b, 0);
  return { runs, totalModules };
}

export interface Code128Options {
  /** Pixel width of a single narrow module. */
  moduleWidth?: number;
  /** Bar height in pixels. */
  height?: number;
}

/**
 * Render `text` as a Code 128-B barcode SVG string with inline attributes only,
 * so it renders identically on screen and inside an isolated print document.
 */
export function code128Svg(text: string, opts: Code128Options = {}): string {
  const moduleWidth = opts.moduleWidth ?? 2;
  const height = opts.height ?? 80;
  const { runs, totalModules } = toModules(text);

  const widthModules = totalModules + QUIET_MODULES * 2;
  const svgWidth = widthModules * moduleWidth;

  let x = QUIET_MODULES; // start after the left quiet zone
  let isBar = true; // runs always begin with a bar
  const rects: string[] = [];
  for (const run of runs) {
    if (isBar) {
      rects.push(
        `<rect x="${(x * moduleWidth).toFixed(2)}" y="0" width="${(run * moduleWidth).toFixed(2)}" height="${height}" fill="#000"/>`,
      );
    }
    x += run;
    isBar = !isBar;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth.toFixed(0)}" height="${height}" ` +
    `viewBox="0 0 ${svgWidth.toFixed(2)} ${height}" preserveAspectRatio="xMidYMid meet" ` +
    `shape-rendering="crispEdges" role="img" aria-label="Barcode ${text}">` +
    `<rect x="0" y="0" width="${svgWidth.toFixed(2)}" height="${height}" fill="#fff"/>` +
    rects.join('') +
    `</svg>`
  );
}
