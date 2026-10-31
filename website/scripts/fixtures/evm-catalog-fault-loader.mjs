import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve as pathResolve, dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dbFixture = pathToFileURL(pathResolve(here, "evm-log-scan-pglite-db.mjs")).href;
const cursorFixture = pathToFileURL(pathResolve(here, "evm-log-scan-cursor-faulty.mjs")).href;

// Remap the real cursor module to a wrapper that can fail one factory on demand, so the catalog's
// per-factory isolation can be exercised without a live database failure.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@/db") return { url: dbFixture, shortCircuit: true };
  if (specifier === "@/lib/evm/log-scan-cursor") return { url: cursorFixture, shortCircuit: true };
  return nextResolve(specifier, context);
}
