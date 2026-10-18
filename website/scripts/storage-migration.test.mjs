import test from "node:test";
import assert from "node:assert/strict";
import {
  migrateStorageKeys,
  WEBSITE_STORAGE_MIGRATIONS,
} from "../src/lib/storage-migration.ts";

function mockStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
    removeItem(key) {
      map.delete(key);
    },
    _map: map,
  };
}

test("migrates when only legacy exists", () => {
  const s = mockStorage({ ovn_lang: "ru" });
  migrateStorageKeys(s, WEBSITE_STORAGE_MIGRATIONS);
  assert.equal(s.getItem("people_lang"), "ru");
  assert.equal(s.getItem("ovn_lang"), null);
});

test("does not overwrite an existing new value", () => {
  const s = mockStorage({ ovn_lang: "ru", people_lang: "en" });
  migrateStorageKeys(s, WEBSITE_STORAGE_MIGRATIONS);
  assert.equal(s.getItem("people_lang"), "en");
  assert.equal(s.getItem("ovn_lang"), "ru");
});

test("removes legacy after copy", () => {
  const s = mockStorage({ ovn_theme: "light" });
  migrateStorageKeys(s, WEBSITE_STORAGE_MIGRATIONS);
  assert.equal(s.getItem("people_theme"), "light");
  assert.equal(s.getItem("ovn_theme"), null);
});

test("no-op when storage throws", () => {
  const s = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
    removeItem() {},
  };
  migrateStorageKeys(s, WEBSITE_STORAGE_MIGRATIONS);
});
