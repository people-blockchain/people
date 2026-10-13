/**
 * Node-test shim for `next/cache`.
 *
 * Next ships `next/cache` as a bare sub-path with no `exports` map, so plain `node --test`
 * cannot resolve `import { unstable_cache } from "next/cache"` (it would need the `.js`
 * extension). Importing the real `next/cache.js` resolves, but calling a wrapped function
 * outside a Next server throws `Invariant: incrementalCache missing`.
 *
 * Unit tests exercise RPC/decoding logic, never Next's incremental cache, so this shim keeps
 * the import graph loadable and makes the wrapper a pass-through (every call is a miss).
 * Production code keeps importing the real `next/cache`.
 */

/** Pass-through replacement for `unstable_cache`: no cache, so every call invokes the function. */
export function unstable_cache(fn) {
  return fn;
}

/** No-ops: nothing is cached here, so there is nothing to invalidate. */
export function revalidateTag() {}
export function revalidatePath() {}
export function revalidate() {}

export const unstable_noStore = () => {};

const nextCacheStub = { unstable_cache, revalidateTag, revalidatePath, unstable_noStore };

export default nextCacheStub;
