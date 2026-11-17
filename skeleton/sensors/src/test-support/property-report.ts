// Runs a property and records what the checkpoint reports need (tasks.md, working rules): the
// number of cases run, the number discarded by filters, and the worst error measured against
// each tolerance. In `test:deep` the summary is printed once per property; in `pnpm test` it is
// only kept.
import fc from 'fast-check';
import { isDeepRun } from './fast-check-setup';

/** The largest measured error, and the tolerance it is measured against, for one quantity. */
interface WorstError {
  readonly toleranceLabel: string;
  worst: number;
  worstCase: string;
}

/** Collects worst errors while a property runs. One per property. */
export class ErrorTracker {
  readonly #errors = new Map<string, WorstError>();

  /**
   * Records `error` (a non-negative magnitude) for the quantity `name`. `toleranceLabel` is the
   * tolerance as the requirement states it, for the report; `caseLabel` describes the case.
   */
  record(name: string, error: number, toleranceLabel: string, caseLabel = ''): void {
    const entry = this.#errors.get(name);
    if (entry === undefined) {
      this.#errors.set(name, { toleranceLabel, worst: error, worstCase: caseLabel });
    } else if (error > entry.worst || Number.isNaN(error)) {
      entry.worst = error;
      entry.worstCase = caseLabel;
    }
  }

  /** The worst error recorded for `name`, or `undefined`. */
  worst(name: string): number | undefined {
    return this.#errors.get(name)?.worst;
  }

  entries(): readonly [string, WorstError][] {
    return [...this.#errors.entries()];
  }
}

export interface PropertyReport {
  readonly id: string;
  readonly numRuns: number;
  readonly numSkips: number;
  readonly errors: readonly [string, WorstError][];
}

const reports: PropertyReport[] = [];

/** Every report recorded so far in this test file. */
export function propertyReports(): readonly PropertyReport[] {
  return reports;
}

/**
 * Checks `property` with fast-check and fails with fast-check's own report if it fails. On
 * success, stores (and in `test:deep` prints) the case count, the discards and the worst errors
 * recorded in `tracker`.
 */
export function checkProperty<Ts extends [unknown, ...unknown[]]>(
  id: string,
  property: fc.IProperty<Ts>,
  tracker: ErrorTracker,
  parameters: fc.Parameters<Ts> = {},
): void {
  const details = fc.check(property, parameters);
  if (details.failed) {
    throw new Error(fc.defaultReportMessage(details) ?? `${id} failed`);
  }
  const report: PropertyReport = {
    id,
    numRuns: details.numRuns,
    numSkips: details.numSkips,
    errors: tracker.entries(),
  };
  reports.push(report);
  if (isDeepRun()) console.log(formatReport(report));
}

export function formatReport(report: PropertyReport): string {
  const lines = [`[deep] ${report.id}: ${report.numRuns} cases, ${report.numSkips} discarded`];
  for (const [name, entry] of report.errors) {
    const where = entry.worstCase === '' ? '' : ` at ${entry.worstCase}`;
    lines.push(
      `[deep]   ${name}: worst ${entry.worst.toExponential(3)} (tolerance ${entry.toleranceLabel})${where}`,
    );
  }
  return lines.join('\n');
}
