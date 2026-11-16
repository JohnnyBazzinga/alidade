// The one Vite feature the purity test uses: `import.meta.glob`, which Vitest resolves at
// transform time. Declared here rather than by pulling in Vite's or Node's types, so that the
// sources of @alidade/core still type-check without any browser or Node globals (Req 11.2).
// The purity test forbids `import.meta` in every non-test source file.
interface ImportMeta {
  glob<Module = unknown>(
    pattern: string | readonly string[],
    options?: { readonly query?: string; readonly import?: string; readonly eager?: boolean },
  ): Record<string, Module>;
}
