/**
 * Public feature flags.
 *
 * These are compile-time constants inlined by Next.js from `NEXT_PUBLIC_*`
 * env vars. Each flag is OFF unless its env var is explicitly set to "1",
 * so unreleased product surfaces stay hidden on the public site by default.
 *
 * // hidden: PeoplePredict (feature flag)
 */
export const PREDICT_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PREDICT === "1";

// People Credit is not surfaced anywhere on the public site yet; the flag
// exists so it can be wired up the same way when it ships.
export const PEOPLE_CREDIT_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PEOPLE_CREDIT === "1";
