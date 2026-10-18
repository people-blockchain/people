/** One-time localStorage/sessionStorage key migrations (legacy → PEOPLE names). */

export type StorageKeyPair = readonly [legacyKey: string, newKey: string];

export const WEBSITE_STORAGE_MIGRATIONS: readonly StorageKeyPair[] = [
  ["ovn_lang", "people_lang"],
  ["ovn_theme", "people_theme"],
  ["ovn_web3auth_pending", "people_web3auth_pending"],
];

/**
 * When `newKey` is absent and `legacyKey` has a value, copy then remove legacy.
 * Safe when storage is unavailable.
 */
export function migrateStorageKeys(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  pairs: readonly StorageKeyPair[],
  options?: { verifyBeforeRemove?: boolean },
): void {
  for (const [legacyKey, newKey] of pairs) {
    try {
      if (storage.getItem(newKey) != null) continue;
      const legacyValue = storage.getItem(legacyKey);
      if (legacyValue == null) continue;
      storage.setItem(newKey, legacyValue);
      if (options?.verifyBeforeRemove && storage.getItem(newKey) !== legacyValue) continue;
      storage.removeItem(legacyKey);
    } catch {
      /* private mode, SSR, or quota */
    }
  }
}

export function migrateWebsiteStorage(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
): void {
  migrateStorageKeys(storage, WEBSITE_STORAGE_MIGRATIONS);
}
