/** Test `@/auth`: the session is whatever the test put in `globalThis.__supportSession`. */
export async function auth() {
  return globalThis.__supportSession ?? null;
}
