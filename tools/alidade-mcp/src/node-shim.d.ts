// A hand-written declaration of the few members of Node that this package imports, in the pattern
// of Sensors' `magvar.d.ts`: the repository has no `@types/node` and adds no dependency for one
// (design D3). The server's own sources use only `process`; the rest is for the tests.

declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readdirSync(path: string): string[];
  export function mkdtempSync(prefix: string): string;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
}

declare module 'node:path' {
  export function join(...segments: string[]): string;
  export function dirname(path: string): string;
  export function relative(from: string, to: string): string;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string): string;
}

declare module 'node:child_process' {
  export interface Readable {
    setEncoding(encoding: 'utf8'): void;
    on(event: 'data', listener: (chunk: string) => void): void;
  }
  export interface Writable {
    write(text: string): boolean;
    end(): void;
  }
  export interface ChildProcess {
    readonly stdin: Writable;
    readonly stdout: Readable;
    readonly stderr: Readable;
    on(event: 'exit', listener: (code: number | null) => void): void;
    kill(): boolean;
  }
  export function spawn(file: string, args: readonly string[]): ChildProcess;
}

interface ImportMeta {
  readonly url: string;
}

declare const process: {
  readonly stdin: {
    setEncoding(encoding: 'utf8'): void;
    on(event: 'data', listener: (chunk: string) => void): void;
    on(event: 'end', listener: () => void): void;
  };
  readonly stdout: { write(text: string): boolean };
  readonly stderr: { write(text: string): boolean };
  exitCode: number | undefined;
};
