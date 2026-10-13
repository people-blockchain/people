/**
 * One click's sign-in attempt, and the "Taking longer than usual" notice that goes with it.
 *
 * A click takes an id; every async continuation of that click checks `isCurrent(id)` before it
 * writes UI state. Retry starts a new attempt (a new id), so the retired one may settle whenever
 * it likes — its late result, including its `finally`, is ignored instead of clearing the busy
 * state of the attempt now running. No React and no globals here — the caller passes the timer in.
 */

export type SignInAttempts = {
  /** Start a new attempt, retiring every earlier one. Returns the id to check with `isCurrent`. */
  begin: () => number;
  /** Whether this attempt is still the one the card is showing. */
  isCurrent: (id: number) => boolean;
  /** (Re)start the slow-notice window for this attempt; a later call restarts the countdown. */
  armSlowNotice: (id: number) => void;
  clearSlowNotice: () => void;
};

type Schedule = (callback: () => void, ms: number) => unknown;
type Unschedule = (handle: unknown) => void;

export function createSignInAttempts(
  onSlow: () => void,
  slowNoticeMs: number,
  schedule: Schedule = (callback, ms) => setTimeout(callback, ms),
  unschedule: Unschedule = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
): SignInAttempts {
  let current = 0;
  let handle: unknown = null;

  const isCurrent = (id: number) => id === current;
  const clearSlowNotice = () => {
    if (handle !== null) {
      unschedule(handle);
      handle = null;
    }
  };

  return {
    begin: () => {
      current += 1;
      clearSlowNotice();
      return current;
    },
    isCurrent,
    armSlowNotice: (id) => {
      clearSlowNotice();
      handle = schedule(() => {
        handle = null;
        // A retired attempt must not raise the notice over the attempt that replaced it.
        if (isCurrent(id)) onSlow();
      }, slowNoticeMs);
    },
    clearSlowNotice,
  };
}
