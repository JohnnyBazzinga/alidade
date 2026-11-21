// A hand-written declaration of the few members of Node that this package imports, in the pattern
// of Sensors' `magvar.d.ts`: the repository has no `@types/node` and adds no dependency for one
// (design D3). `tsc` fails when a source uses a member that is not declared here.

declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function realpathSync(path: string): string;
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function writeFileSync(path: string, data: string): void;
  export function mkdtempSync(prefix: string): string;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  export function symlinkSync(target: string, path: string): void;
  export function readdirSync(path: string): string[];
}

declare module 'node:path' {
  export function resolve(...segments: string[]): string;
  export function join(...segments: string[]): string;
  export function dirname(path: string): string;
  export function relative(from: string, to: string): string;
  export function isAbsolute(path: string): boolean;
  export const sep: string;
}

declare module 'node:os' {
  export function tmpdir(): string;
  export function homedir(): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}

declare module 'node:child_process' {
  export interface SpawnResult {
    readonly status: number | null;
    readonly stdout: string;
    readonly stderr: string;
  }
  export interface SpawnOptions {
    readonly cwd?: string;
    readonly input?: string;
    readonly encoding?: 'utf8';
    readonly timeout?: number;
    readonly env?: Record<string, string | undefined>;
    readonly maxBuffer?: number;
  }
  export function execFileSync(
    file: string,
    args: readonly string[],
    options: SpawnOptions & { readonly encoding: 'utf8' },
  ): string;
  export function spawnSync(
    file: string,
    args: readonly string[],
    options?: SpawnOptions,
  ): SpawnResult;
}

interface ImportMeta {
  readonly url: string;
}

declare class URL {
  constructor(url: string, base?: string);
  readonly href: string;
}

declare const process: {
  readonly argv: readonly string[];
  readonly env: Record<string, string | undefined>;
  exitCode: number | undefined;
  readonly stdin: { setEncoding(encoding: 'utf8'): void } & AsyncIterable<string>;
  readonly stdout: { write(text: string): boolean };
  readonly stderr: { write(text: string): boolean };
  exit(code: number): never;
  cwd(): string;
};
