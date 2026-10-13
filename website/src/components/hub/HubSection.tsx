import type { ReactNode } from "react";
import { SectionIntro } from "@/components/ui/primitives";

export function HubSection({
  id,
  extraIds,
  eyebrow,
  title,
  lead,
  tone = "brand",
  children,
  canvas = "canvas",
}: {
  id: string;
  extraIds?: string[];
  eyebrow: string;
  title: string;
  lead?: string;
  tone?: "brand" | "value" | "warm" | "violet" | "neutral";
  children: ReactNode;
  canvas?: "canvas" | "canvas-2";
}) {
  return (
    <section
      id={id}
      className={`anchor-offset relative border-b border-line py-10 lg:py-14 ${
        canvas === "canvas-2" ? "bg-canvas-2" : "bg-canvas"
      }`}
    >
      {extraIds?.map((alias) => (
        <div key={alias} id={alias} className="anchor-offset" />
      ))}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionIntro
          eyebrow={eyebrow}
          title={title}
          lead={lead}
          tone={tone}
          className="max-w-3xl"
          titleClassName="text-[clamp(1.35rem,2.4vw,1.85rem)]"
        />
        <div className="mt-6">{children}</div>
      </div>
    </section>
  );
}
