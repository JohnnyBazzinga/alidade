// The README of the package (Req 13.8, 4.7, 9.2, 15): how to run the reviewer's path, what the app
// measures and its limits in the words of Req 9.2, how to measure the index error, and the sources
// of the Sun's position and of the refraction formula. What the code can check is checked.

import { describe, expect, it } from 'vitest';
import { GUIDANCE } from './components/GuidanceBlock';
import { REVIEWER_PATH } from './components/simulation/ReviewerPath';

const README = Object.values(
  import.meta.glob<string>('../README.md', { query: '?raw', import: 'default', eager: true }),
)[0];
const ENV_EXAMPLE = Object.values(
  import.meta.glob<string>('../.env.example', { query: '?raw', import: 'default', eager: true }),
)[0];
const raw = README ?? '';
/** The README with its line breaks folded, so that a sentence wrapped by the formatter still matches. */
const text = raw.replace(/\s+/g, ' ');

function section(title: string): string {
  const start = raw.indexOf(`## ${title}\n`);
  if (start < 0) return '';
  const rest = raw.slice(start + `## ${title}\n`.length);
  const next = rest.search(/^## /m);
  return (next < 0 ? rest : rest.slice(0, next)).replace(/\s+/g, ' ');
}

describe('apps/nonius/README.md', () => {
  it('has the sections of Req 13.8', () => {
    for (const title of [
      'Build commands',
      "The reviewer's path",
      'What it measures',
      'Its limits',
      'Measuring the index error',
      'Sources',
      "The map's tile provider",
    ]) {
      expect(section(title), title).not.toBe('');
    }
  });

  it('opens with what the app is, and says it is a backup and not navigation equipment', () => {
    expect(raw.split('\n')[0]).toBe('# Nonius');
    expect(text).toContain('backup and a teaching instrument');
    expect(text).toContain('not navigation equipment');
  });

  it('tells the reviewer’s path in the order the page itself gives it, and names the scenes', () => {
    const path = section("The reviewer's path");
    expect(path).toContain('Next sight time');
    expect(path).toContain('Simulation mode');
    for (const scene of [
      'A good day',
      'Sights too close in time',
      'One sight disagrees',
      'A phone never calibrated',
    ]) {
      expect(path, scene).toContain(scene);
    }
    expect(REVIEWER_PATH).toHaveLength(3);
    const positions = [
      'Sight the Sun',
      'Start',
      'Freeze',
      'Capture',
      'Done',
      'Next sight time',
    ].map((w) => path.indexOf(w));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('states the limits of Req 9.2: 111 km a degree, the clock, no GPS, the sigma, the 95 % assumptions', () => {
    const limits = section('Its limits');
    expect(limits).toContain('111 km');
    expect(limits).toContain('60 nautical miles');
    expect(limits).toContain('28 km');
    expect(limits).toContain('No GPS is used for the position');
    expect(limits).toContain('3.5°');
    expect(limits).toContain('95 %');
    expect(limits).toContain("centre of the Sun's glare");
  });

  it('says how to measure the index error, and that the location is not kept', () => {
    const body = section('Measuring the index error');
    expect(body).toContain('Measure the index error');
    expect(body).toContain('location');
    expect(body).toContain('not kept');
    expect(body).toContain('10°');
  });

  it('names the sources of the Sun’s position and of the refraction formula', () => {
    const sources = section('Sources');
    expect(sources).toContain('astronomy-engine');
    expect(sources).toContain('2.1.19');
    expect(sources).toContain('Bennett');
    expect(sources).toContain('Meeus');
  });

  it('names the four build variables of .env.example, exactly those', () => {
    const names = (ENV_EXAMPLE ?? '')
      .split('\n')
      .filter((l) => /^[A-Z][A-Z0-9_]*=$/.test(l))
      .map((l) => l.slice(0, -1));
    expect(names).toHaveLength(4);
    for (const name of names) expect(section("The map's tile provider"), name).toContain(name);
  });

  it('gives the sighting rules the screen gives, in the words of the screen', () => {
    expect(GUIDANCE.join(' ')).toContain('never at the Sun');
    expect(text).toContain('never at the Sun');
  });
});
