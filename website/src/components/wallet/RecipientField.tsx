"use client";
import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { walletUxCopy } from "@/lib/wallet-ux-copy";
import { parseWalletAddress } from "@/lib/wallet-activity";
import { AddressQrScanner } from "./AddressQrScanner";

interface Contact { address: string; name: string }
export function RecipientField({ value, onChange, label, storageKey, disabled = false }: {
  value: string; onChange: (value: string) => void; label: string; storageKey: string; disabled?: boolean;
}) {
  const { lang } = useLanguage(); const t = walletUxCopy(lang);
  const [contacts, setContacts] = useState<Contact[]>(() => {
    try { const list = JSON.parse(localStorage.getItem(storageKey) ?? "[]"); return Array.isArray(list) ? list.filter((row: Contact) => typeof row.name === "string" && typeof row.address === "string" && parseWalletAddress(row.address)).slice(0,100) : []; } catch { return []; }
  });
  const [name, setName] = useState(""); const [error, setError] = useState(""); const [scan, setScan] = useState(false);
  function save(next: Contact[]) {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setContacts(next); setError(""); } catch { setError(t.unavailable); }
  }
  async function paste() {
    try { const text = await navigator.clipboard.readText(); onChange(parseWalletAddress(text) ?? text.trim()); setError(""); } catch { setError(t.clipboard); }
  }
  return <div className="space-y-2">
    <label className="block text-sm">{label}<input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} autoComplete="off" className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 font-mono text-xs" /></label>
    <div className="flex flex-wrap gap-3 text-xs"><button type="button" disabled={disabled} onClick={() => void paste()} className="text-brand">{t.paste}</button><button type="button" disabled={disabled} onClick={() => setScan(true)} className="text-brand">{t.scan}</button></div>
    <details className="rounded-xl border border-line p-3"><summary className="cursor-pointer text-sm">{t.contacts}</summary>
      <div className="mt-3 flex gap-2"><input value={name} disabled={disabled} maxLength={64} onChange={(event) => setName(event.target.value)} placeholder={t.name} aria-label={t.name} className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-2 py-1 text-sm" />
      <button type="button" disabled={disabled || !name.trim() || !parseWalletAddress(value)} onClick={() => { const address = parseWalletAddress(value); if (address) { save([{ address, name: name.trim() }, ...contacts.filter((row) => row.address.toLowerCase() !== address.toLowerCase())].slice(0,100)); setName(""); } }} className="text-sm text-brand disabled:opacity-40">{t.save}</button></div>
      <ul className="mt-2 space-y-2">{contacts.map((contact) => <li key={contact.address} className="flex items-center gap-2"><button type="button" disabled={disabled} onClick={() => onChange(contact.address)} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm">{contact.name}</span><span className="block truncate font-mono text-xs text-ink-3">{contact.address}</span></button><button type="button" disabled={disabled} onClick={() => save(contacts.filter((row) => row.address !== contact.address))} className="text-xs text-warm">{t.remove}</button></li>)}</ul>
    </details>
    {error && <p role="alert" className="text-xs text-warm">{error}</p>}
    {scan && <AddressQrScanner onClose={() => setScan(false)} onAddress={(address) => { onChange(address); setScan(false); }} />}
  </div>;
}
