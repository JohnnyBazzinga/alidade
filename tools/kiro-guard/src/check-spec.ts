// `check-spec`: the format of a requirements file (Req 4.3), as the existing specifications have
// it. Problems are listed as `<path>:<line>: <message>`.

import { relative, resolve } from 'node:path';

const SECTIONS = ['## Introduction', '## Glossary', '## Requirements'] as const;

/** The problem with a path that is not a requirements file of a specification, or null. */
export function specPathProblem(path: string, root: string): string | null {
  if (path.length === 0) return 'no path was given.';
  const relativePath = relative(root, resolve(root, path));
  if (relativePath.startsWith('..')) return 'the path is outside the repository.';
  if (relativePath === 'notes' || relativePath.startsWith('notes/')) {
    return 'the path is under the private folder notes/.';
  }
  if (!/^\.kiro\/specs\/[^/]+\/requirements\.md$/.test(relativePath)) {
    return 'the path is not .kiro/specs/<name>/requirements.md.';
  }
  return null;
}

interface Line {
  readonly number: number;
  readonly text: string;
}

export function checkSpec(text: string, path: string): string[] {
  const problems: string[] = [];
  const report = (line: number, message: string): void => {
    problems.push(`${path}:${line}: ${message}`);
  };

  const all = text.split(/\r?\n/);
  if (all[0] !== '# Requirements Document') {
    report(1, 'the first line must be "# Requirements Document".');
  }

  // Lines outside code fences.
  const lines: Line[] = [];
  let fenced = false;
  all.forEach((line, index) => {
    if (/^\s*```/.test(line)) fenced = !fenced;
    else if (!fenced) lines.push({ number: index + 1, text: line });
  });

  // The three sections, in order.
  let previous: { heading: string; number: number } | null = null;
  for (const heading of SECTIONS) {
    const found = lines.find((line) => line.text === heading);
    if (found === undefined) {
      report(1, `the section "${heading}" is missing.`);
      continue;
    }
    if (previous !== null && found.number < previous.number) {
      report(found.number, `the section "${heading}" must come after "${previous.heading}".`);
    } else {
      previous = { heading, number: found.number };
    }
  }

  // The requirements.
  const starts = lines.filter((line) => /^### Requirement\b/.test(line.text));
  let expected = 0;
  for (const start of starts) {
    const match = /^### Requirement (\d+): (\S.*)$/.exec(start.text);
    if (match === null) {
      report(start.number, 'a requirement heading is "### Requirement N: <title>".');
      continue;
    }
    expected++;
    const number = Number(match[1]);
    if (number !== expected) {
      report(start.number, `the requirement is numbered ${number} and must be ${expected}.`);
    }
    const block: Line[] = [];
    for (const line of lines) {
      if (line.number <= start.number) continue;
      if (line.text.startsWith('## ') || line.text.startsWith('### ')) break;
      block.push(line);
    }
    if (!block.some((line) => line.text.startsWith('**User Story:**'))) {
      report(start.number, `requirement ${expected} has no "**User Story:**" line.`);
    }
    const criteriaAt = block.findIndex((line) => line.text === '#### Acceptance Criteria');
    if (criteriaAt < 0) {
      report(start.number, `requirement ${expected} has no "#### Acceptance Criteria" heading.`);
      continue;
    }
    let next = 1;
    let last = 0;
    for (const line of block.slice(criteriaAt + 1)) {
      const item = /^(\d+)\. /.exec(line.text);
      if (item === null) continue;
      const itemNumber = Number(item[1]);
      if (itemNumber === last) {
        report(line.number, `criterion ${itemNumber} repeats; the number must be ${next}.`);
      } else if (itemNumber !== next) {
        report(line.number, `criterion ${itemNumber} follows ${last}; the number must be ${next}.`);
      }
      last = itemNumber;
      next++;
    }
    if (next === 1) {
      report(
        start.number,
        `requirement ${expected} has no criterion after "#### Acceptance Criteria".`,
      );
    }
  }
  return problems;
}
