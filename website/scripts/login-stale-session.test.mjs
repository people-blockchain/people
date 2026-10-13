import test from "node:test";
import assert from "node:assert/strict";
import {
  shouldSkipLoginForSession,
  WALLET_VAULT_REAUTH_WINDOW_MS,
} from "../src/lib/wallet-reauth-window.ts";

const now = 1_791_890_000_000;

test("/login skips itself only for a session that can still open the vault", () => {
  assert.equal(shouldSkipLoginForSession({ userId: "u1", authTime: now - 60_000 }, now), true);
});

test("a stale (yesterday's) session stays on /login so Google sign-in can refresh it", () => {
  assert.equal(shouldSkipLoginForSession({ userId: "u1", authTime: now - 12 * 3600_000 }, now), false);
  assert.equal(shouldSkipLoginForSession({ userId: "u1", authTime: now - WALLET_VAULT_REAUTH_WINDOW_MS - 1 }, now), false);
});

test("no user or no authTime never skips /login", () => {
  assert.equal(shouldSkipLoginForSession(null, now), false);
  assert.equal(shouldSkipLoginForSession({ userId: "u1" }, now), false);
  assert.equal(shouldSkipLoginForSession({ authTime: now }, now), false);
});
