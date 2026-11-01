import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve as pathResolve, dirname } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));

/** This process only: `@/auth` is a signed-out stub so the route can be called without NextAuth. */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@/auth") {
    return { url: pathToFileURL(pathResolve(dir, "founder-nft-auth-stub.mjs")).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
