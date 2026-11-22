import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve as pathResolve, dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const stub = (name) => pathToFileURL(pathResolve(here, name)).href;

const MAP = new Map([
  ["@/db", stub("support-chat-db.mjs")],
  ["@/auth", stub("support-chat-auth-stub.mjs")],
  ["@/lib/discover/admin", stub("support-chat-admin-stub.mjs")],
  ["@/lib/support-chat/notify", stub("support-chat-notify-stub.mjs")],
]);

export async function resolve(specifier, context, nextResolve) {
  const url = MAP.get(specifier);
  if (url) return { url, shortCircuit: true };
  return nextResolve(specifier, context);
}
