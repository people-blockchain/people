import { SiteChrome } from "@/components/SiteChrome";
import { SkeletonRows } from "@/components/explorer/ExplorerSkeleton";

/**
 * Route-level skeleton for /explorer/tokens. The token catalog is fetched from the chain, so the
 * page must render a list-shaped placeholder instead of a bare spinner while that request is in
 * flight — text-only skeletons keep the layout stable and avoid a full-page jump on arrival.
 */
export default function TokensLoading() {
  return (
    <SiteChrome>
      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6" aria-busy="true">
        <span className="block h-3 w-24 animate-pulse rounded-full bg-surface-2" />
        <span className="mt-3 block h-9 w-48 animate-pulse rounded-lg bg-surface-2" />
        <SkeletonRows count={7} />
      </section>
    </SiteChrome>
  );
}
