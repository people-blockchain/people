import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  readLastAuthMethod,
  rememberAuthMethod,
  rememberAuthEmail,
  readLastAuthEmail,
} from "./wallet-auth-storage.ts";

describe("wallet auth storage", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    (globalThis as { window?: unknown }).window = {};
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
    };
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("defaults last auth method to google", () => {
    assert.equal(readLastAuthMethod(), "google");
  });

  it("remembers email_passwordless when that was the last login", () => {
    rememberAuthMethod("email_passwordless");
    assert.equal(readLastAuthMethod(), "email_passwordless");
    rememberAuthMethod("google");
    assert.equal(readLastAuthMethod(), "google");
  });

  it("remembers email", () => {
    rememberAuthEmail("someone@gmail.com");
    assert.equal(readLastAuthEmail(), "someone@gmail.com");
  });
});
