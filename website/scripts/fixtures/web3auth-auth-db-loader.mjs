import { pathToFileURL } from "node:url";
import { resolve as pathResolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const fixture = pathToFileURL(
  pathResolve(dirname(fileURLToPath(import.meta.url)), "web3auth-auth-pglite-db.mjs"),
).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@/db") return { url: fixture, shortCircuit: true };
  return nextResolve(specifier, context);
}
