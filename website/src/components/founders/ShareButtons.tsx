"use client";

import { useRef, useState } from "react";
import type { FoundersPromoCopy } from "@/lib/founders-promo-content";
import { fireConfetti } from "./founders-ui";

export function shareTargets(url: string, text: string) {
  const u = encodeURIComponent(url);
  const tx = encodeURIComponent(text);
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    telegram: `https://t.me/share/url?url=${u}&text=${tx}`,
    x: `https://x.com/intent/post?text=${tx}&url=${u}`,
  };
}

/** Copy / WhatsApp / Telegram / X. Copy fires a small confetti burst. */
export function ShareButtons({
  url,
  text,
  t,
  testId,
}: {
  url: string;
  text: string;
  t: FoundersPromoCopy;
  testId?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copyRef = useRef<HTMLButtonElement | null>(null);
  const targets = shareTargets(url, text);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      fireConfetti(copyRef.current);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable: the link stays selectable */
    }
  }

  const pill =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink transition hover:border-brand hover:text-brand";

  return (
    <div className="flex flex-wrap gap-2" data-testid={testId}>
      <button
        ref={copyRef}
        type="button"
        onClick={() => void copy()}
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-brand-ink transition hover:brightness-110"
        aria-live="polite"
      >
        {copied ? t.shareCopied : t.shareCopy}
      </button>
      <a className={pill} href={targets.whatsapp} target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#25d366]" fill="currentColor" aria-hidden="true">
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.8 0-1.3.7-2 1-2.3.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.3 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.7 1.2 1.5 1.9 1 .9 1.9 1.2 2.2 1.3.3.1.4.1.6-.1l.8-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.1.1.6-.1 1.2Z" />
        </svg>
        {t.shareWhatsApp}
      </a>
      <a className={pill} href={targets.telegram} target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#229ed9]" fill="currentColor" aria-hidden="true">
          <path d="M21.9 4.3 18.8 19c-.2 1-.8 1.3-1.7.8l-4.6-3.4-2.2 2.1c-.3.3-.5.5-1 .5l.3-4.7 8.6-7.8c.4-.3-.1-.5-.6-.2L6.9 13 2.3 11.6c-1-.3-1-1 .2-1.5L20.5 3.2c.8-.3 1.6.2 1.4 1.1Z" />
        </svg>
        {t.shareTelegram}
      </a>
      <a className={pill} href={targets.x} target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
          <path d="M17.8 3h3.1l-6.8 7.7 8 10.3h-6.2l-4.9-6.3L5.4 21H2.3l7.2-8.2L1.8 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z" />
        </svg>
        {t.shareX}
      </a>
    </div>
  );
}
