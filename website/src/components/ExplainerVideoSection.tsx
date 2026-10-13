"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { content } from "@/lib/content";
import { getExplainerVideoSources } from "@/lib/explainer-video";
import { useInView } from "@/components/motion/useInView";
import { WarmSection } from "@/components/warm/warm-ui";

/**
 * Locale-specific homepage explainer. Poster + reserved aspect-video box avoid
 * CLS; the mp4 src is attached only after the section enters the viewport
 * (preload="none"). Playback is click-to-play, muted + playsInline.
 */
export function ExplainerVideoSection() {
  const { lang } = useLanguage();
  const t = content[lang].explainerVideo;
  const { mp4, poster } = getExplainerVideoSources(lang);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { ref: inViewRef, inView } = useInView<HTMLDivElement>({
    threshold: 0.05,
    rootMargin: "200px 0px",
    once: true,
  });
  const [showPlayOverlay, setShowPlayOverlay] = useState(true);
  const [srcReady, setSrcReady] = useState(false);

  useEffect(() => {
    if (inView) setSrcReady(true);
  }, [inView]);

  // Locale switch: reset overlay and pause any prior playback.
  useEffect(() => {
    setShowPlayOverlay(true);
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
  }, [mp4]);

  const startPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.src && srcReady) {
      video.src = mp4;
      video.load();
    }
    void video.play().catch(() => {
      /* autoplay policies can still reject; overlay stays */
    });
  }, [mp4, srcReady]);

  return (
    <WarmSection
      id="explainer-video"
      testId="explainer-video-section"
      tone="canvas-2"
      center
      eyebrow={t.eyebrow}
      title={t.title}
    >
      <div ref={inViewRef} className="mt-8">
        <div className="mx-auto w-full max-w-4xl overflow-hidden rounded-3xl border border-line bg-surface shadow-[var(--elev-1)]">
          {/* aspect-video reserves height before the poster/mp4 paint — no CLS */}
          <div className="relative aspect-video w-full bg-ink/5 dark:bg-ink/20">
            <video
              key={mp4}
              ref={videoRef}
              className="h-full w-full bg-black object-contain"
              poster={poster}
              src={srcReady ? mp4 : undefined}
              muted
              playsInline
              preload="none"
              controls={!showPlayOverlay}
              onPlay={() => setShowPlayOverlay(false)}
              onPause={() => setShowPlayOverlay(true)}
              onEnded={() => setShowPlayOverlay(true)}
              aria-label={t.videoAria}
              data-testid="explainer-video-el"
            />
            {showPlayOverlay && (
              <button
                type="button"
                onClick={startPlayback}
                className="absolute inset-0 flex items-center justify-center bg-ink/25 transition-colors hover:bg-ink/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand dark:bg-ink/35 dark:hover:bg-ink/45"
                aria-label={t.playLabel}
                data-testid="explainer-video-play"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-white shadow-lg ring-4 ring-white/20 sm:h-20 sm:w-20">
                  <Play className="ml-0.5 h-8 w-8 fill-current sm:h-10 sm:w-10" aria-hidden="true" />
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </WarmSection>
  );
}
