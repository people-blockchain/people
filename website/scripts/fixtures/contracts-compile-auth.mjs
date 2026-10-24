// Test-only stand-in for `@/auth`: the session is set by the test via globalThis.
export async function auth() {
  return globalThis.__compileTestSession ?? null;
}
