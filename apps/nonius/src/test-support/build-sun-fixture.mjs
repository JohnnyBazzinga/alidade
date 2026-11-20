// Builds `fixtures/sun-published.json` (task 3.1; Req 3.4, 4.10) from the raw responses of the
// U.S. Naval Observatory's services that the lead retrieved on 2026-11-20 and kept unchanged in
// `/tmp/nonius/usno/` with an `index.json` (address and retrieval time of each file). It reads
// those files and nothing else: no value comes from the library under test or from memory. The
// only arithmetic is the conversion of the service's own text (a time of day, `HH:MM:SS.ssss`) to
// seconds, and of the request's date and time to UTC milliseconds.
//
// Run from `apps/nonius`:  node src/test-support/build-sun-fixture.mjs [source-folder]
// The output is deterministic; `sun-fixture.test.ts` holds its SHA-256.

import { readFileSync, writeFileSync } from 'node:fs';
import { argv } from 'node:process';
import { URL } from 'node:url';
import console from 'node:console';

const sourceFolder = argv[2] ?? '/tmp/nonius/usno';
const outputPath = new URL('../../fixtures/sun-published.json', import.meta.url);

const index = JSON.parse(readFileSync(`${sourceFolder}/index.json`, 'utf8'));

function timeSeconds(text) {
  const [h, m, s] = text.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

function utcMs(date, time) {
  const full = time.length === 5 ? `${time}:00` : time;
  const ms = Date.parse(`${date}T${full}Z`);
  if (!Number.isFinite(ms)) throw new Error(`bad date or time: ${date} ${time}`);
  return ms;
}

const celnav = [];
const sidereal = [];

for (const request of index.requests) {
  const query = new URL(request.url).searchParams;
  const raw = JSON.parse(readFileSync(`${sourceFolder}/${request.file}`, 'utf8'));
  const id = request.file.replace(/\.json$/, '');
  const date = query.get('date');
  const time = query.get('time');
  if (request.file.startsWith('celnav-')) {
    const sun = raw.properties.data.filter((d) => d.object === 'Sun');
    if (sun.length !== 1) throw new Error(`${request.file}: expected one Sun entry`);
    const [longitudeDeg, latitudeDeg] = raw.geometry.coordinates;
    const almanac = sun[0].almanac_data;
    const corrections = sun[0].altitude_corrections;
    celnav.push({
      id,
      file: request.file,
      url: request.url,
      retrievedUtc: request.retrievedUtc,
      dateUt1: date,
      timeUt1: time,
      timeUtcMs: utcMs(date, time),
      latitudeDeg,
      longitudeDeg,
      sunDeclinationDeg: almanac.dec,
      ghaDeg: almanac.gha,
      hcDeg: almanac.hc,
      znDeg: almanac.zn,
      refractionDeg: corrections.refr,
      parallaxDeg: corrections.pa,
      semidiameterDeg: corrections.sd,
    });
  } else if (request.file.startsWith('sidereal-')) {
    const row = raw.properties.data[0];
    sidereal.push({
      id,
      file: request.file,
      url: request.url,
      retrievedUtc: request.retrievedUtc,
      dateUt1: date,
      timeUt1: time,
      timeUtcMs: utcMs(date, time),
      gmstText: row.gmst,
      gastText: row.gast,
      eqOfEquinoxesText: row.eqofeq,
      gmstTimeSeconds: timeSeconds(row.gmst),
      gastTimeSeconds: timeSeconds(row.gast),
      eqOfEquinoxesTimeSeconds: Number(row.eqofeq),
    });
  } else {
    throw new Error(`unknown file: ${request.file}`);
  }
}

const fixture = {
  source:
    "U.S. Naval Observatory, Astronomical Applications Department, https://aa.usno.navy.mil/data/api (celnav and siderealtime services); raw responses retrieved 2026-11-20 and saved unchanged. Hc is the computed geocentric altitude of the Sun (no refraction, no parallax); Zn the computed azimuth; refractionDeg the service's refraction correction (negative: it is added to the apparent altitude); times are UT1.",
  celnav,
  sidereal,
};

writeFileSync(outputPath, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`wrote ${celnav.length} celnav rows and ${sidereal.length} sidereal rows`);
