// The published Sun fixture as tests read it (test support, not exported): the text of
// `fixtures/sun-published.json` and its rows. Read-only; made by `build-sun-fixture.mjs`.

export interface CelnavRow {
  readonly id: string;
  readonly file: string;
  readonly url: string;
  readonly retrievedUtc: string;
  readonly dateUt1: string;
  readonly timeUt1: string;
  readonly timeUtcMs: number;
  readonly latitudeDeg: number;
  readonly longitudeDeg: number;
  readonly sunDeclinationDeg: number;
  readonly ghaDeg: number;
  readonly hcDeg: number;
  readonly znDeg: number;
  readonly refractionDeg: number;
  readonly parallaxDeg: number;
  readonly semidiameterDeg: number;
}

export interface SiderealRow {
  readonly id: string;
  readonly file: string;
  readonly url: string;
  readonly retrievedUtc: string;
  readonly dateUt1: string;
  readonly timeUt1: string;
  readonly timeUtcMs: number;
  readonly gmstText: string;
  readonly gastText: string;
  readonly eqOfEquinoxesText: string;
  readonly gmstTimeSeconds: number;
  readonly gastTimeSeconds: number;
  readonly eqOfEquinoxesTimeSeconds: number;
}

export interface SunFixture {
  readonly source: string;
  readonly celnav: readonly CelnavRow[];
  readonly sidereal: readonly SiderealRow[];
}

export const FIXTURE_TEXT: string | undefined = Object.values(
  import.meta.glob<string>('../../fixtures/sun-published.json', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
)[0];

export function sunFixture(): SunFixture {
  return JSON.parse(FIXTURE_TEXT ?? '{"source":"","celnav":[],"sidereal":[]}') as SunFixture;
}
