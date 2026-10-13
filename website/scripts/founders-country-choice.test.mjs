import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COUNTRY_CHOICE_STORAGE_KEY,
  readStoredCountryChoice,
  resolveInitialCountryChoice,
  writeStoredCountryChoice,
} from "../src/lib/founders/country-choice.ts";

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    map,
  };
}

test("a chosen country round-trips through storage", () => {
  const store = memoryStorage();
  writeStoredCountryChoice(store, "de");
  assert.equal(readStoredCountryChoice(store), "DE");
  assert.equal(store.map.get(COUNTRY_CHOICE_STORAGE_KEY), "DE");
});

test("invalid or junk codes are not written and are not read back", () => {
  const store = memoryStorage();
  writeStoredCountryChoice(store, "XX");
  writeStoredCountryChoice(store, "nope");
  assert.equal(store.map.has(COUNTRY_CHOICE_STORAGE_KEY), false);

  store.setItem(COUNTRY_CHOICE_STORAGE_KEY, "not-a-country");
  assert.equal(readStoredCountryChoice(store), null);
});

test("a storage read failure is treated as no stored choice", () => {
  const throwing = {
    getItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(readStoredCountryChoice(throwing), null);
});

test("an earlier explicit choice wins over a fresh browser guess", () => {
  const store = memoryStorage();
  writeStoredCountryChoice(store, "US");
  assert.equal(resolveInitialCountryChoice(store, () => "GE"), "US");
});

test("with nothing stored yet, the browser guess is used", () => {
  const store = memoryStorage();
  assert.equal(resolveInitialCountryChoice(store, () => "GE"), "GE");
  assert.equal(resolveInitialCountryChoice(null, () => "FR"), "FR");
});
