import { describe, expect, it } from 'vitest';
import { buildCatalogue } from './catalogue';

const FIXTURES = import.meta.glob<unknown>('../../../fixtures/catalogue-before-task-27.json', {
  import: 'default',
  eager: true,
});

// Req 17.14: the catalogue built through `scriptForStation` equals, deeply, the one the package
// gave before the function existed. The fixture is read-only (testing.md, rule 3); the JSON round
// trip is lossless for these values (every number is finite, and a double's round trip is exact).
describe('the catalogue after task 27 equals the catalogue before it (Req 17.14)', () => {
  const before = Object.values(FIXTURES)[0] as readonly { scene: { id: string } }[] | undefined;

  it('has the eleven scenes of the fixture', () => {
    expect(before).toBeDefined();
    expect(before?.length).toBe(11);
  });

  const built = buildCatalogue();
  const now: readonly unknown[] = built.ok ? JSON.parse(JSON.stringify(built.value)) : [];

  it('builds', () => {
    expect(built.ok).toBe(true);
    expect(now.length).toBe(11);
  });

  for (let i = 0; i < 11; i += 1) {
    const entry = before?.[i];
    it(`scene ${i + 1} (${entry?.scene.id ?? '?'}): scene and scripts are unchanged`, () => {
      expect(now[i]).toEqual(entry);
    });
  }
});
