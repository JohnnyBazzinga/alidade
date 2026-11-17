// Parsers for the official WMM2025 test values in `fixtures/wmm2025/` (Req 6.10, 13.4). The files
// are read as text through `import.meta.glob` and never modified.

const RAW = import.meta.glob<string>('../../fixtures/wmm2025/*.txt', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** The raw text of a fixture file, by file name. */
export function wmmFixtureText(fileName: string): string {
  const entry = Object.entries(RAW).find(([path]) => path.endsWith(`/${fileName}`));
  if (entry === undefined) throw new Error(`missing fixture ${fileName}`);
  return entry[1];
}

/** One published test point, with the fields the tests use. */
export interface WmmTestPoint {
  readonly file: string;
  readonly decimalYear: number;
  readonly heightKm: number;
  readonly latitudeDeg: number;
  readonly longitudeDeg: number;
  readonly declinationDeg: number;
  readonly horizontalIntensityNt: number;
}

/** Column positions (0-based) of each file, from its own header. */
const COLUMNS: Record<string, { readonly declination: number; readonly h: number }> = {
  'WMM2025_TEST_VALUES.txt': { declination: 10, h: 7 },
  'WMM2025_TestValues.txt': { declination: 4, h: 6 },
};

export const WMM_FIXTURE_FILES = Object.keys(COLUMNS);

/** Parses one fixture file: comment lines start with `#`; fields are whitespace-separated. */
export function wmmTestPoints(fileName: string): WmmTestPoint[] {
  const columns = COLUMNS[fileName];
  if (columns === undefined) throw new Error(`unknown fixture ${fileName}`);
  const points: WmmTestPoint[] = [];
  for (const line of wmmFixtureText(fileName).split(/\r?\n/)) {
    if (line.trim() === '' || line.startsWith('#')) continue;
    const fields = line.trim().split(/\s+/).map(Number);
    const field = (index: number): number => {
      const value = fields[index];
      if (value === undefined || !Number.isFinite(value)) {
        throw new Error(`bad field ${index} in ${fileName}: ${line}`);
      }
      return value;
    };
    points.push({
      file: fileName,
      decimalYear: field(0),
      heightKm: field(1),
      latitudeDeg: field(2),
      longitudeDeg: field(3),
      declinationDeg: field(columns.declination),
      horizontalIntensityNt: field(columns.h),
    });
  }
  return points;
}

/** Every published point of both files. */
export function allWmmTestPoints(): WmmTestPoint[] {
  return WMM_FIXTURE_FILES.flatMap((file) => wmmTestPoints(file));
}

/** SHA-256 of a text, in lower-case hexadecimal, through Web Crypto. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
