// Resolves extensionless and `@/` imports for TypeScript run with --experimental-strip-types,
// without the test-only live-RPC block (used by scripts/return-cosigner.ts).
import { register } from "node:module";

register("./node-test-alias-loader.mjs", import.meta.url);
