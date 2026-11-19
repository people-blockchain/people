/** Test `@/lib/discover/admin`: admin state is `globalThis.__supportIsAdmin`. */
export async function isDiscoverAdmin() {
  return globalThis.__supportIsAdmin === true;
}
