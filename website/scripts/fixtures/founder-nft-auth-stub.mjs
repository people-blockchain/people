/** Test stand-in for `@/auth`. Always signed out, so the signature route must answer 401. */
export async function auth() {
  return null;
}
