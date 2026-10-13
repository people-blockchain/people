"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useInView } from "@/components/motion/useInView";
import type { AgentsPublicCopy } from "@/lib/agents-public-content";

type FlowCopy = AgentsPublicCopy["workflow"];

const STEP_MS = 2200;
const TYPING_MS = 28;

export function AgentsWorkflowAnimation({ copy }: { copy: FlowCopy }) {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.3, once: false });
  const steps = copy.steps;
  const [activeStep, setActiveStep] = useState(0);
  const [typedLen, setTypedLen] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const sampleTask = useMemo(
    () => steps[0]?.body ?? "Send 50 PPL to the community pool within today's cap.",
    [steps],
  );

  useEffect(() => {
    if (!inView) {
      setActiveStep(0);
      setTypedLen(0);
      return;
    }
    if (reducedMotion) {
      const tick = window.setInterval(() => {
        setActiveStep((s) => (s + 1) % steps.length);
      }, STEP_MS);
      return () => window.clearInterval(tick);
    }
    const tick = window.setInterval(() => {
      setActiveStep((s) => (s + 1) % steps.length);
      setTypedLen(0);
    }, STEP_MS);
    return () => window.clearInterval(tick);
  }, [inView, reducedMotion, steps.length]);

  useEffect(() => {
    if (!inView || reducedMotion || activeStep !== 0) return;
    if (typedLen >= sampleTask.length) return;
    const t = window.setTimeout(() => setTypedLen((n) => n + 1), TYPING_MS);
    return () => window.clearTimeout(t);
  }, [inView, reducedMotion, activeStep, typedLen, sampleTask]);

  const running = inView;
  const typed = reducedMotion ? sampleTask : sampleTask.slice(0, typedLen);

  return (
    <div
      ref={ref}
      role="img"
      aria-label={copy.aria}
      data-testid="agents-workflow-animation"
      data-animated={running ? "true" : "false"}
      className={`agents-workflow agents-workflow-v2 mt-8 rounded-2xl border border-line bg-canvas-2 p-4 sm:p-6 ${running ? "is-on" : ""} ${reducedMotion ? "is-reduced" : ""}`}
      style={{ "--active-step": activeStep } as CSSProperties}
    >
      <div className="agents-workflow-agent-card mb-6 rounded-xl border border-line bg-surface p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{steps[0]?.title}</p>
        <p className="mt-2 min-h-[2.5rem] text-sm leading-snug text-ink">
          {typed}
          {!reducedMotion && activeStep === 0 && typedLen < sampleTask.length ? (
            <span className="agents-workflow-caret" aria-hidden="true" />
          ) : null}
        </p>
      </div>

      <ol className="relative flex flex-col gap-0 sm:flex-row sm:items-stretch sm:justify-between sm:gap-2">
        {steps.map((step, index) => {
          const lit = running && (reducedMotion ? index === activeStep : index <= activeStep);
          const pulse = running && !reducedMotion && index === activeStep;
          return (
            <li
              key={step.id}
              className={`agents-workflow-step relative flex flex-1 flex-col items-center px-2 py-3 text-center ${lit ? "is-lit" : ""} ${pulse ? "is-pulse" : ""}`}
              style={{ "--step-index": index } as CSSProperties}
            >
              {index < steps.length - 1 ? (
                <span className="agents-workflow-connector hidden sm:block" aria-hidden="true" />
              ) : null}
              <span className="agents-workflow-node flex h-11 w-11 items-center justify-center rounded-full border-2 border-line bg-surface text-sm font-bold text-ink-3">
                {index + 1}
              </span>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-3">{step.title}</p>
              <p className="mt-1 text-sm leading-snug text-ink-2">{step.body}</p>
              {pulse ? (
                <span className="agents-workflow-packet mt-2 text-lg" aria-hidden="true">→</span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
