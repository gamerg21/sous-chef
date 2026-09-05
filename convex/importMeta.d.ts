// Vitest (via Vite) provides import.meta.glob at runtime for convex-test
// module discovery. Vite is not a direct dependency, so declare the shape
// here instead of referencing vite/client types.
interface ImportMeta {
  glob: (pattern: string) => Record<string, () => Promise<unknown>>;
}
