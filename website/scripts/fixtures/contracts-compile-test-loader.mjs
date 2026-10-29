import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve as pathResolve, dirname } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));

// Stand-ins for modules that need a live database or a Next server runtime.
const redirects = {
  "@/db": "factory-icon-pglite-db.mjs",
  "@/auth": "contracts-compile-auth.mjs",
};

export async function resolve(specifier, context, nextResolve) {
  const file = redirects[specifier];
  if (file) {
    return { url: pathToFileURL(pathResolve(dir, file)).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
