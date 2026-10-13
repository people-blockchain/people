"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { docsContent } from "@/lib/docs-content";
import { resolvePublicNodeSetup } from "@/lib/node-setup";

export function NodeQuickStart() {
  const { lang } = useLanguage();
  const t = docsContent[lang] ?? docsContent.en;
  const qs = t.nodeQuickStart;
  const setup = resolvePublicNodeSetup();
  const command = setup.command ?? "";
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  return (
    <div className="mt-7 rounded-2xl border border-brand/30 bg-surface p-5">
      <h3 className="text-lg font-semibold">{qs.title}</h3>
      <p className="mt-3 leading-relaxed text-ink-2">{qs.intro}</p>
      <pre
        tabIndex={0}
        className="mt-4 overflow-x-auto rounded-lg bg-canvas p-4 text-xs leading-6"
      >
        <code>{command}</code>
      </pre>
      <button
        type="button"
        className="mt-3 rounded-lg border border-line px-4 py-2 text-sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(command);
            setCopied(true);
            setCopyError(false);
          } catch {
            setCopyError(true);
          }
        }}
      >
        {copied ? qs.copied : qs.copy}
      </button>
      {copyError && (
        <p role="status" className="mt-2 text-sm text-ink-2">{qs.copyManual}</p>
      )}
      <p className="mt-4 text-sm text-ink-2">{qs.hint}</p>
    </div>
  );
}
