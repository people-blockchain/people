import { pathToFileURL } from "node:url";
import { resolve as pathResolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const fixture = pathToFileURL(
  pathResolve(dirname(fileURLToPath(import.meta.url)), "durable-rate-limit-throw.mjs"),
).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@/lib/durable-rate-limit") return { url: fixture, shortCircuit: true };
  return nextResolve(specifier, context);
}
