/** Row-shaped placeholder shown while an explorer list loads, instead of a lone spinner. */
export function SkeletonRows({ count = 6, className = "mt-6" }: { count?: number; className?: string }) {
  return (
    <ul className={`${className} divide-y divide-line rounded-2xl border border-line`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex flex-col gap-2 px-4 py-3">
          <span className="h-3.5 w-28 animate-pulse rounded-full bg-surface-2" />
          <span className="h-3 w-44 animate-pulse rounded-full bg-surface-2" />
        </li>
      ))}
    </ul>
  );
}
