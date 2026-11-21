import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkSpec, specPathProblem } from './check-spec.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const GOOD = [
  '# Requirements Document',
  '',
  '## Introduction',
  '',
  'Text.',
  '',
  '## Glossary',
  '',
  '- **A**: b.',
  '',
  '## Requirements',
  '',
  '### Requirement 1: First',
  '',
  '**User Story:** As a, I want b, so that c.',
  '',
  '#### Acceptance Criteria',
  '',
  '1. THE a SHALL b.',
  '2. THE c SHALL d.',
  '',
  '### Requirement 2: Second',
  '',
  '**User Story:** As a, I want b, so that c.',
  '',
  '#### Acceptance Criteria',
  '',
  '1. THE a SHALL b.',
  '',
].join('\n');

function problems(text: string): string[] {
  return checkSpec(text, 'x/requirements.md');
}

function replaceLine(text: string, from: string, to: string): string {
  expect(text).toContain(from);
  return text.replace(from, to);
}

/** The text without the last occurrence of a fragment (the fragment is in the last requirement). */
function removeLast(text: string, fragment: string): string {
  const at = text.lastIndexOf(fragment);
  expect(at).toBeGreaterThan(0);
  return text.slice(0, at) + text.slice(at + fragment.length);
}

describe('checkSpec (Req 4.3)', () => {
  it('accepts a well-formed file', () => {
    expect(problems(GOOD)).toStrictEqual([]);
  });

  it('wants the title on the first line', () => {
    expect(problems(replaceLine(GOOD, '# Requirements Document', '# Requirements'))).toStrictEqual([
      'x/requirements.md:1: the first line must be "# Requirements Document".',
    ]);
  });

  it('wants the three sections', () => {
    expect(problems(replaceLine(GOOD, '## Glossary', '## Words'))).toStrictEqual([
      'x/requirements.md:1: the section "## Glossary" is missing.',
    ]);
  });

  it('wants the sections in order', () => {
    const swapped = GOOD.replace('## Introduction', '## TMP')
      .replace('## Glossary', '## Introduction')
      .replace('## TMP', '## Glossary');
    expect(problems(swapped)).toStrictEqual([
      'x/requirements.md:3: the section "## Glossary" must come after "## Introduction".',
    ]);
  });

  it('wants the requirements numbered 1, 2, … without a gap', () => {
    expect(
      problems(replaceLine(GOOD, 'Requirement 2: Second', 'Requirement 3: Second')),
    ).toStrictEqual(['x/requirements.md:22: the requirement is numbered 3 and must be 2.']);
  });

  it('wants a title after the number', () => {
    expect(problems(replaceLine(GOOD, 'Requirement 2: Second', 'Requirement 2'))).toStrictEqual([
      'x/requirements.md:22: a requirement heading is "### Requirement N: <title>".',
    ]);
  });

  it('wants a User Story in each requirement', () => {
    const text = removeLast(GOOD, '**User Story:** As a, I want b, so that c.\n\n');
    expect(problems(text)).toStrictEqual([
      'x/requirements.md:22: requirement 2 has no "**User Story:**" line.',
    ]);
  });

  it('wants an Acceptance Criteria heading in each requirement', () => {
    const text = replaceLine(
      GOOD,
      '#### Acceptance Criteria\n\n1. THE a SHALL b.\n2.',
      '1. THE a SHALL b.\n2.',
    );
    expect(problems(text)).toStrictEqual([
      'x/requirements.md:13: requirement 1 has no "#### Acceptance Criteria" heading.',
    ]);
  });

  it('wants at least one criterion after the heading', () => {
    const text = removeLast(GOOD, '1. THE a SHALL b.\n');
    expect(problems(text)).toStrictEqual([
      'x/requirements.md:22: requirement 2 has no criterion after "#### Acceptance Criteria".',
    ]);
  });

  it('wants the criteria numbered from 1 without a repeat or a gap', () => {
    expect(problems(replaceLine(GOOD, '2. THE c SHALL d.', '1. THE c SHALL d.'))).toStrictEqual([
      'x/requirements.md:20: criterion 1 repeats; the number must be 2.',
    ]);
    expect(problems(replaceLine(GOOD, '2. THE c SHALL d.', '3. THE c SHALL d.'))).toStrictEqual([
      'x/requirements.md:20: criterion 3 follows 1; the number must be 2.',
    ]);
  });

  it('does not read headings inside code fences', () => {
    const text = GOOD + '\n```\n### Requirement 9\n```\n';
    expect(problems(text)).toStrictEqual([]);
  });

  it('lists every problem with its line', () => {
    const text = replaceLine(
      replaceLine(GOOD, '# Requirements Document', '# R'),
      'Requirement 2: Second',
      'Requirement 5: Second',
    );
    expect(problems(text)).toHaveLength(2);
  });

  it('does not throw on empty or odd input', () => {
    expect(() => problems('')).not.toThrow();
    expect(problems('')).not.toStrictEqual([]);
    expect(() => problems('\u0000\r\n### Requirement')).not.toThrow();
  });
});

describe('the real requirements files pass (Req 4.3)', () => {
  it.each(['sighting-core', 'skeleton-sensors', 'skeleton-ui', 'vigia', 'nonius', 'kiro-tooling'])(
    '.kiro/specs/%s/requirements.md',
    (name) => {
      const path = `.kiro/specs/${name}/requirements.md`;
      expect(checkSpec(readFileSync(resolve(ROOT, path), 'utf8'), path)).toStrictEqual([]);
    },
  );
});

describe('specPathProblem (Req 4.3)', () => {
  it.each(['.kiro/specs/vigia/requirements.md', `${ROOT}/.kiro/specs/nonius/requirements.md`])(
    'accepts %s',
    (path) => {
      expect(specPathProblem(path, ROOT)).toBeNull();
    },
  );

  it.each([
    'docs/a.md',
    'notes/.kiro/specs/x/requirements.md',
    '.kiro/specs/x/design.md',
    '.kiro/specs/requirements.md',
    '../elsewhere/.kiro/specs/x/requirements.md',
    '',
  ])('refuses %s', (path) => {
    expect(specPathProblem(path, ROOT)).toEqual(expect.any(String));
  });
});
