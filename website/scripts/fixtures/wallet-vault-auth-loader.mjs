import { pathToFileURL } from "node:url";
import { resolve as pathResolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const stub = pathToFileURL(
  pathResolve(dirname(fileURLToPath(import.meta.url)), "wallet-vault-auth-stub.mjs"),
).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@/auth") return { url: stub, shortCircuit: true };
  return nextResolve(specifier, context);
}
