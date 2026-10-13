"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { walletUxCopy } from "@/lib/wallet-ux-copy";

export function WalletDialog({ title, closeLabel, onClose, busy = false, children }: {
  title: string; closeLabel?: string; onClose: () => void; busy?: boolean; children: ReactNode;
}) {
  const {lang} = useLanguage();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);
  return <dialog ref={ref} aria-label={title} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-6 text-ink shadow-xl backdrop:bg-black/50">
    <div className="mb-5 flex items-center justify-between gap-4"><h2 className="text-xl font-bold">{title}</h2><button type="button" disabled={busy} onClick={onClose} aria-label={closeLabel??walletUxCopy(lang).close} className="rounded-lg px-3 py-2 text-ink-3">×</button></div>
    {children}
  </dialog>;
}
