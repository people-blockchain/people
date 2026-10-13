import { pathToFileURL } from "node:url";
import { resolve as pathResolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const fixture = pathToFileURL(
  pathResolve(dirname(fileURLToPath(import.meta.url)), "referral-pglite-db.mjs"),
).href;
const chainVerifyFixture = pathToFileURL(
  pathResolve(dirname(fileURLToPath(import.meta.url)), "referral-chain-verify-fixture.mjs"),
).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@/db") return { url: fixture, shortCircuit: true };
  if (specifier === "./chain-verify.ts" && context.parentURL?.includes("/founders/referral-service.ts")) {
    return { url: chainVerifyFixture, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
