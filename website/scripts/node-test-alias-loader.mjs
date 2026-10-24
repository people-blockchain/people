import { dirname, resolve as pathResolve } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = pathResolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = pathResolve(root, "src");

/** Try `<base>.ts` / `.tsx` / `index.ts` for an extensionless specifier, else null. */
function withTypeScriptExtension(base) {
  for (const candidate of [`${base}.ts`, `${base}.tsx`, pathResolve(base, "index.ts"), `${base}.json`]) {
    if (existsSync(candidate) && !statSync(candidate).isDirectory()) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  // `next/cache` has no package `exports` entry, so bare ESM resolution fails and the real
  // module throws `incrementalCache missing` outside a Next server. Map it to an inert shim
  // (see scripts/stubs/next-cache.mjs) so unit tests can import modules that cache internally.
  if (specifier === "next/cache" || specifier === "next/cache.js") {
    return nextResolve(pathToFileURL(pathResolve(root, "scripts/stubs/next-cache.mjs")).href, context);
  }
  // `next/server` has no `exports` entry either; the `.js` file is the real module, so route
  // handlers (NextResponse) can be imported and called directly in tests.
  if (specifier === "next/server") {
    return nextResolve("next/server.js", context);
  }
  // Next/TS allow extensionless relative imports (`./bootstrap`); Node's ESM resolver does
  // not, so map them to the real file before handing off.
  if (specifier.startsWith(".") && !/\.[a-zA-Z0-9]+$/.test(specifier) && context.parentURL) {
    const resolved = withTypeScriptExtension(fileURLToPath(new URL(specifier, context.parentURL)));
    if (resolved) {
      const url = pathToFileURL(resolved).href;
      if (resolved.endsWith(".json")) {
        return nextResolve(url, { ...context, importAttributes: { type: "json" } });
      }
      return nextResolve(url, context);
    }
    return nextResolve(specifier, context);
  }
  if (!specifier.startsWith("@/")) {
    return nextResolve(specifier, context);
  }
  const rel = specifier.slice(2);
  // A bare `src/<rel>` path is only a valid ESM target when it is a file — if it is a
  // directory (e.g. `@/db` -> `src/db/`), Node throws ERR_UNSUPPORTED_DIR_IMPORT, so the
  // directory's `index.ts` must be tried first.
  const bare = pathResolve(srcRoot, rel);
  const candidates = [
    pathResolve(srcRoot, `${rel}.ts`),
    pathResolve(srcRoot, `${rel}.tsx`),
    pathResolve(srcRoot, rel, "index.ts"),
    pathResolve(srcRoot, `${rel}.json`),
    bare,
  ];
  for (const file of candidates) {
    if (!existsSync(file) || statSync(file).isDirectory()) continue;
    const url = pathToFileURL(file).href;
    if (file.endsWith(".json")) {
      return nextResolve(url, { ...context, importAttributes: { type: "json" } });
    }
    return nextResolve(url, context);
  }
  return nextResolve(specifier, context);
}
