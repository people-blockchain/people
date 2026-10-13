"use client";

import { useEffect, useState } from "react";
import { Check, FileCode2, MessageSquareText, Rocket } from "lucide-react";
import { useInView } from "@/components/motion/useInView";

type Copy = {
  prompt: string;
  step1: string;
  step2: string;
  step3: string;
  contractTitle: string;
  contractLines: string[];
  deploy: string;
  deployed: string;
};

const STEP_MS = 1800;

/**
 * Short loop: plain sentence -> contract card -> Deploy. Cycles only while on
 * screen; with reduced motion all three steps are shown at once, no cycling.
 */
export function ContractBuildLoop({ copy }: { copy: Copy }) {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.3, once: false });
  const [step, setStep] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!inView || reduced) return;
    const id = window.setInterval(() => setStep((s) => (s + 1) % 4), STEP_MS);
    return () => window.clearInterval(id);
  }, [inView, reduced]);

  const shown = reduced ? 3 : step;
  const on = (n: number) => shown >= n;
  const card = "build-loop-card rounded-2xl border p-4 transition-all duration-500";
  const state = (n: number) =>
    on(n) ? "border-brand/50 bg-surface opacity-100 translate-y-0" : "border-line bg-surface/40 opacity-45 translate-y-1";

  return (
    <div
      ref={ref}
      data-testid="build-loop"
      data-step={shown}
      data-animated={inView && !reduced ? "true" : "false"}
      className="build-loop mt-6 grid max-w-4xl gap-3 md:grid-cols-3"
    >
      <div className={`${card} ${state(0)}`}>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
          <MessageSquareText className="h-4 w-4 text-brand" aria-hidden="true" />
          {copy.step1}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink">
          {copy.prompt}<span className={`build-loop-caret ${shown === 0 && !reduced ? "is-on" : ""}`} aria-hidden="true" />
        </p>
      </div>
      <div className={`${card} ${state(1)}`}>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
          <FileCode2 className="h-4 w-4 text-violet" aria-hidden="true" />
          {copy.step2}
        </p>
        <p className="mt-3 text-sm font-bold text-ink">{copy.contractTitle}</p>
        <ul className="mt-2 space-y-1.5">
          {copy.contractLines.map((line) => (
            <li key={line} className="flex items-start gap-1.5 text-xs leading-snug text-ink-2">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-value" aria-hidden="true" />
              {line}
            </li>
          ))}
        </ul>
      </div>
      <div className={`${card} ${state(2)} flex flex-col`}>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
          <Rocket className="h-4 w-4 text-warm" aria-hidden="true" />
          {copy.step3}
        </p>
        <span
          aria-hidden="true"
          className={`mt-3 inline-flex min-h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors duration-300 ${
            on(3) ? "bg-value text-brand-ink" : "bg-brand text-brand-ink"
          } ${shown === 2 && !reduced ? "build-loop-press" : ""}`}
        >
          {on(3) ? (
            <>
              <Check className="mr-1.5 h-4 w-4" />
              {copy.deployed}
            </>
          ) : (
            copy.deploy
          )}
        </span>
      </div>
    </div>
  );
}
