export function DiscoverFeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <ul className="mt-10 flex flex-col gap-8" aria-busy="true" aria-label="Loading projects">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="surface-elevated animate-pulse overflow-hidden rounded-2xl p-5 sm:p-6">
          <div className="h-3 w-24 rounded bg-line" />
          <div className="mt-4 flex gap-3">
            <div className="h-12 w-12 shrink-0 rounded-full bg-line" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-5 w-2/3 max-w-xs rounded bg-line" />
              <div className="h-3 w-full rounded bg-line" />
              <div className="h-3 w-5/6 rounded bg-line" />
            </div>
          </div>
          <div className="mt-5 h-9 w-40 rounded-lg bg-line" />
        </li>
      ))}
    </ul>
  );
}

export function DiscoverProjectDetailSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 animate-pulse" aria-busy="true">
      <div className="h-4 w-24 rounded bg-line" />
      <div className="mt-6 flex gap-3">
        <div className="h-14 w-14 shrink-0 rounded-full bg-line" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="h-6 w-1/2 max-w-sm rounded bg-line" />
          <div className="h-4 w-full rounded bg-line" />
          <div className="h-4 w-11/12 rounded bg-line" />
        </div>
      </div>
      <div className="mt-8 h-10 w-full max-w-md rounded-xl bg-line" />
    </div>
  );
}
