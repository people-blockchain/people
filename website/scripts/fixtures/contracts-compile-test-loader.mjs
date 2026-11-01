import { pathToFileURL } from "node:url";
import { resolve as pathResolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const nextServer = pathToFileURL(pathResolve(dir, "..", "stubs", "next-server.mjs")).href;

const redirects = {
  "@/db": "factory-icon-pglite-db.mjs",
  "@/auth": "contracts-compile-auth.mjs",
};

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server" || specifier === "next/server.js") {
    return { url: nextServer, shortCircuit: true };
  }
  const file = redirects[specifier];
  if (file) {
    return { url: pathToFileURL(pathResolve(dir, file)).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
