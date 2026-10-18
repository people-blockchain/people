import { describe, expect, it } from "vitest";
import { migrateStorageKeys, PEOPLE_WEB_STORAGE_MIGRATIONS } from "./storageMigration.js";

function mockStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
    map,
  };
}

describe("migrateStorageKeys", () => {
  it("migrates when only legacy exists", () => {
    const s = mockStorage({ "ovn-language": "en" });
    migrateStorageKeys(s, PEOPLE_WEB_STORAGE_MIGRATIONS, { verifyBeforeRemove: true });
    expect(s.getItem("people-language")).toBe("en");
    expect(s.getItem("ovn-language")).toBeNull();
  });

  it("does not overwrite an existing new value", () => {
    const s = mockStorage({
      "people-wallets": "[]",
      "ovn-wallets": '[{"id":"x"}]',
    });
    migrateStorageKeys(s, PEOPLE_WEB_STORAGE_MIGRATIONS, { verifyBeforeRemove: true });
    expect(s.getItem("people-wallets")).toBe("[]");
    // Legacy may remain when the new key already exists (safe no-op).
    expect(s.getItem("ovn-wallets")).toBe('[{"id":"x"}]');
  });

  it("wallet key survives verify-before-remove", () => {
    const payload = JSON.stringify([{ id: "w1", address: "0x1" }]);
    const s = mockStorage({ "ovn-wallets": payload });
    migrateStorageKeys(s, PEOPLE_WEB_STORAGE_MIGRATIONS, { verifyBeforeRemove: true });
    expect(s.getItem("people-wallets")).toBe(payload);
    expect(s.getItem("ovn-wallets")).toBeNull();
  });

  it("no-op when storage throws", () => {
    const s = {
      getItem() {
        throw new Error("denied");
      },
      setItem() {},
      removeItem() {},
    };
    migrateStorageKeys(s, PEOPLE_WEB_STORAGE_MIGRATIONS);
  });
});
