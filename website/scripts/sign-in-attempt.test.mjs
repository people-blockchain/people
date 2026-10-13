import { test } from "node:test";
import assert from "node:assert/strict";
import { createSignInAttempts } from "../src/lib/sign-in-attempt.ts";

/** Minimal clock: the scheduled callback only runs when the test fires it. */
function fakeClock() {
  let armed = null;
  return {
    schedule: (callback) => {
      armed = callback;
      return "handle";
    },
    unschedule: () => {
      armed = null;
    },
    fire: () => {
      const callback = armed;
      armed = null;
      callback?.();
    },
    get isArmed() {
      return armed !== null;
    },
  };
}

test("the slow notice fires once, for the attempt that armed it", () => {
  const clock = fakeClock();
  let notices = 0;
  const attempts = createSignInAttempts(() => notices++, 20_000, clock.schedule, clock.unschedule);
  const attempt = attempts.begin();

  attempts.armSlowNotice(attempt);
  assert.equal(clock.isArmed, true);
  clock.fire();
  assert.equal(notices, 1);
  assert.equal(clock.isArmed, false, "a fired notice is not left armed");
  assert.equal(attempts.isCurrent(attempt), true);
});

test("re-arming restarts the window instead of stacking notices", () => {
  const clock = fakeClock();
  let notices = 0;
  const attempts = createSignInAttempts(() => notices++, 20_000, clock.schedule, clock.unschedule);
  const attempt = attempts.begin();

  attempts.armSlowNotice(attempt);
  attempts.armSlowNotice(attempt); // popup resolved: the finishing phase gets its own window
  clock.fire();
  assert.equal(notices, 1, "only the latest window may fire");
  assert.equal(clock.isArmed, false);
});

test("a retired attempt never raises its notice over the attempt that replaced it", () => {
  const clock = fakeClock();
  let notices = 0;
  const attempts = createSignInAttempts(() => notices++, 20_000, clock.schedule, clock.unschedule);

  const first = attempts.begin();
  attempts.armSlowNotice(first);
  const second = attempts.begin(); // Retry
  assert.equal(attempts.isCurrent(first), false);
  assert.equal(attempts.isCurrent(second), true);
  assert.equal(clock.isArmed, false, "starting an attempt drops the previous timer");
  clock.fire();
  assert.equal(notices, 0);

  attempts.armSlowNotice(second);
  clock.fire();
  assert.equal(notices, 1);
});

test("clearing the notice drops an armed timer (success, failure, bfcache)", () => {
  const clock = fakeClock();
  let notices = 0;
  const attempts = createSignInAttempts(() => notices++, 20_000, clock.schedule, clock.unschedule);
  attempts.armSlowNotice(attempts.begin());
  attempts.clearSlowNotice();
  assert.equal(clock.isArmed, false);
  clock.fire();
  assert.equal(notices, 0);
});

test("with real timers the notice arrives after the delay, not before", async () => {
  let notices = 0;
  const attempts = createSignInAttempts(() => notices++, 20);
  attempts.armSlowNotice(attempts.begin());
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(notices, 0);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(notices, 1);
  attempts.clearSlowNotice();
});
