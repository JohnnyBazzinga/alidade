// The one Vite feature the tests use to read fixtures and sources as text:
// `import.meta.glob`, which Vitest resolves at transform time. Declared here rather than by
// pulling in Vite's or Node's types. The purity test forbids `import.meta` in every source file
// outside test support.
interface ImportMeta {
  glob<Module = unknown>(
    pattern: string | readonly string[],
    options?: { readonly query?: string; readonly import?: string; readonly eager?: boolean },
  ): Record<string, Module>;
}
