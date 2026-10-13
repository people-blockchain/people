import { SiteChrome } from "@/components/SiteChrome";

/**
 * Route-level skeleton for /swap. Pools and reserves are read from the chain, so the route shows a
 * swap-shaped placeholder (pools rail + swap card) instead of a bare spinner while that request is
 * in flight, keeping the layout stable on arrival.
 */
export default function SwapLoading() {
  return (
    <SiteChrome>
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8" aria-busy="true" data-testid="swap-skeleton">
        <span className="block h-3 w-24 animate-pulse rounded-full bg-surface-2" />
        <span className="mt-3 block h-9 w-56 animate-pulse rounded-lg bg-surface-2" />
        <span className="mt-3 block h-4 w-80 max-w-full animate-pulse rounded-full bg-surface-2" />
        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="surface-elevated rounded-3xl p-6">
            <span className="block h-5 w-28 animate-pulse rounded-full bg-surface-2" />
            <div className="mt-4 space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-2" />
              ))}
            </div>
          </div>
          <div className="surface-elevated rounded-3xl p-6">
            <span className="block h-5 w-32 animate-pulse rounded-full bg-surface-2" />
            <div className="mt-4 space-y-3">
              <div className="h-24 animate-pulse rounded-2xl bg-surface-2" />
              <div className="h-24 animate-pulse rounded-2xl bg-surface-2" />
              <div className="h-12 animate-pulse rounded-xl bg-surface-2" />
            </div>
          </div>
        </div>
      </section>
    </SiteChrome>
  );
}
