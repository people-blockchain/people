import type { HomeWarmCopy } from "@/lib/home-warm-content";

type Stage = HomeWarmCopy["hero"]["stages"][number];

export function HomeHeroSteps({
  stages,
  className,
  compact,
}: {
  stages: Stage[];
  className?: string;
  compact?: boolean;
}) {
  return (
    <ol className={className} data-testid="home-hero-beats">
      {stages.map((beat, index) => (
        <li
          key={beat.id}
          className={`flex items-start gap-2.5 rounded-2xl border border-line bg-surface/60 ${
            compact ? "px-3 py-2" : "px-4 py-3"
          }`}
        >
          <span
            className={`mt-0.5 grid shrink-0 place-items-center rounded-full bg-brand/10 font-bold text-brand ${
              compact ? "h-5 w-5 text-[10px]" : "h-6 w-6 text-[11px]"
            }`}
            aria-hidden="true"
          >
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className={`font-semibold text-ink ${compact ? "text-xs" : "text-sm"}`}>{beat.label}</p>
            <p className={`text-ink-2 ${compact ? "mt-0.5 text-[11px] leading-snug" : "mt-0.5 text-xs"}`}>
              {beat.sub}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}