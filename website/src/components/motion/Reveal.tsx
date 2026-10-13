"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger in milliseconds. */
  delay?: number;
  id?: string;
  style?: CSSProperties;
}

/**
 * Subtle scroll reveal (opacity + 20px rise). The hidden state lives behind the
 * `js-motion` class on <html>, so visitors without JS or with reduced motion
 * enabled always see fully rendered content.
 *
 * Mobile Safari / Android Chrome sometimes never fire IntersectionObserver for
 * tall cards (threshold + negative rootMargin). A short failsafe forces visible
 * so content cannot stay stuck at opacity:0.
 */
export function Reveal({ children, className = "", delay = 0, id, style }: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let done = false;
    const show = () => {
      if (done) return;
      done = true;
      setVisible(true);
    };

    // Never leave content invisible if IO is flaky (common on Android Chrome).
    const failsafe = window.setTimeout(show, 320);

    if (typeof IntersectionObserver === "undefined") {
      const frame = requestAnimationFrame(show);
      return () => {
        cancelAnimationFrame(frame);
        window.clearTimeout(failsafe);
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            show();
            observer.disconnect();
          }
        }
      },
      // Positive rootMargin so tall mobile cards intersect sooner.
      { threshold: 0.01, rootMargin: "80px 0px 80px 0px" },
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      window.clearTimeout(failsafe);
    };
  }, []);

  return (
    <div
      ref={ref}
      id={id}
      className={`reveal ${visible ? "is-visible" : ""} ${className}`}
      style={{ ...style, ["--reveal-delay" as string]: `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}
