"use client";

import { useLanguage } from "@/context/LanguageContext";
import { discoverCopy } from "@/lib/discover-content";
import { parseScreenshotUris } from "@/lib/discover/screenshots";
import { DiscoverScreenshot } from "@/components/discover/DiscoverScreenshot";
import { resolveDiscoverVideoUrl } from "@/lib/discover/video";
import { AssetImage } from "@/components/ui/AssetImage";

export type DiscoverCardPresentationProps = {
  title: string;
  summary?: string;
  idea: string;
  audience: string;
  whyToken: string;
  tags?: string[];
  tokenAssetId: string;
  tokenSymbol?: string;
  tokenIconUri?: string | null;
  videoUri?: string | null;
  screenshotUrisJson?: string | null;
  compact?: boolean;
};

export function DiscoverProjectCardPresentation({
  title,
  summary,
  idea,
  audience,
  whyToken,
  tags = [],
  tokenAssetId,
  tokenSymbol,
  tokenIconUri,
  videoUri,
  screenshotUrisJson,
  compact,
}: DiscoverCardPresentationProps) {
  const { lang } = useLanguage();
  const t = discoverCopy[lang];
  const shots = parseScreenshotUris(screenshotUrisJson);
  const video = videoUri?.trim() ? resolveDiscoverVideoUrl(videoUri) : null;
  const symbol = tokenSymbol ?? tokenAssetId.toUpperCase();

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {video ? (
        <div className="aspect-video overflow-hidden rounded-xl bg-black">
          <video className="h-full w-full object-contain" controls playsInline preload="metadata" src={video} />
        </div>
      ) : null}
      <div className="flex gap-3">
        <AssetImage
          assetId={tokenAssetId}
          name={symbol}
          src={tokenIconUri}
          className={compact ? "h-12 w-12" : "h-14 w-14"}
        />
        <div className="min-w-0 flex-1">
          <h2 className={`font-semibold text-ink ${compact ? "text-base" : "text-lg"}`}>{title}</h2>
          {summary ? <p className={`mt-1 text-ink-2 ${compact ? "text-xs" : "text-sm"}`}>{summary}</p> : null}
          {tags.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-full border border-line bg-surface px-2 py-0.5 text-[0.65rem] font-medium text-ink-2 sm:text-xs"
                >
                  {tag}
                </li>
              ))}
            </ul>
          ) : null}
          <dl className={`mt-2 space-y-2 text-ink-2 ${compact ? "text-xs" : "text-sm"}`}>
            <div>
              <dt className="font-medium text-ink">{t.detail.idea}</dt>
              <dd className={compact ? "line-clamp-2" : undefined}>{idea}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">{t.detail.audience}</dt>
              <dd className={compact ? "line-clamp-2" : undefined}>{audience}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">{t.detail.whyToken}</dt>
              <dd className={compact ? "line-clamp-2" : undefined}>{whyToken}</dd>
            </div>
          </dl>
        </div>
      </div>
      {shots.length > 0 ? (
        <ul className={`grid gap-2 ${shots.length > 1 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1"}`}>
          {shots.map((uri) => (
            <DiscoverScreenshot key={uri} uri={uri} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
