/** One-time browser storage key migrations (legacy → PEOPLE names). */

export type StorageKeyPair = readonly [legacyKey: string, newKey: string];

export const PEOPLE_WEB_STORAGE_MIGRATIONS: readonly StorageKeyPair[] = [
  ["ovn-wallets", "people-wallets"],
  ["ovn-devices", "people-devices"],
  ["ovn-tx-queue", "people-tx-queue"],
  ["ovn-referrer", "people-referrer"],
  ["ovn-referrer-bindings", "people-referrer-bindings"],
  ["ovn-address-book", "people-address-book"],
  ["ovn-language", "people-language"],
  ["ovn-theme", "people-theme"],
  ["ovn-status-samples", "people-status-samples"],
  ["ovn-status-incidents", "people-status-incidents"],
  ["ovn-light-attestations", "people-light-attestations"],
];

/**
 * When `newKey` is absent and `legacyKey` has a value, copy then remove legacy.
 * With `verifyBeforeRemove`, legacy is removed only if the new value matches (wallet safety).
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
      /* unavailable */
    }
  }
}

export function migratePeopleWebStorage(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
): void {
  migrateStorageKeys(storage, PEOPLE_WEB_STORAGE_MIGRATIONS, { verifyBeforeRemove: true });
}
