"use client";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useExternalWalletOptional, signViaActiveSigner } from "@/context/ExternalWalletContext";
import { mobileWalletApi, observeMobilePair } from "@/lib/mobile-wallet/browser";

const copy = {
  ru: { title: "PEOPLE Wallet на телефоне", intro: "Подключите приложение PEOPLE к этому сайту. Сайт увидит ваш адрес. Каждую подпись вы подтверждаете в приложении", start: "Подключить PEOPLE Wallet", scan: "Скопируйте ссылку. В приложении откройте «Настройки → Подключение к сайту», вставьте ссылку и проверьте подключение", copy: "Скопировать ссылку", copied: "Ссылка скопирована", waiting: "Подтвердите подключение в приложении", code: "Код подключения — сверьте его с приложением", connected: "Приложение подключено", duration: "Подключение действует 15 минут. Через него доступны только подписи сообщений, без переводов", disconnect: "Отключить", cancel: "Отмена", error: "Не удалось выполнить действие. Проверьте подключение или создайте новую ссылку", sign: "Проверить подпись сообщения", signed: "Подпись получена и проверена", pending: "Подтвердите подпись в приложении", expired: "Срок подключения истёк. Создайте новую ссылку", message: "Проверка подключения PEOPLE Wallet. Это сообщение не разрешает переводы или доступ к средствам" },
  en: { title: "PEOPLE Wallet on your phone", intro: "Connect the PEOPLE app to this website. The site can see your address. You approve every signature in the app.", start: "Connect PEOPLE Wallet", scan: "Copy the link, then open Settings → Website connection in the app and paste it.", copy: "Copy link", copied: "Link copied", waiting: "Approve the connection in the app", code: "Connection code — compare it with the app", connected: "App connected", duration: "Connections last 15 minutes. Only message signatures are supported, without transfers.", disconnect: "Disconnect", cancel: "Cancel", error: "Could not complete the action. Check the connection or create a new link.", sign: "Test message signing", signed: "Signature received and verified", pending: "Approve the signature in the app", expired: "Connection expired. Create a new link.", message: "PEOPLE Wallet connection check. This message does not authorize transfers or access to funds." },
};
type Pending = { id: string; browserToken: string; link: string; expiresAt: string };
export function PeopleMobileConnect({ onConnected, diagnostic = false }: { onConnected?: () => void; diagnostic?: boolean }) {
  const { lang } = useLanguage(); const c = lang === "ru" ? copy.ru : copy.en;
  const wallet = useExternalWalletOptional();
  const [pending, setPending] = useState<Pending | null>(null);
  const [qr, setQr] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(false); const [notice, setNotice] = useState("");
  const [incomingLink, setIncomingLink] = useState("");
  const pendingRef = useRef<Pending | null>(null);
  const connected = wallet?.signer?.kind === "people-mobile";
  useEffect(() => { if (!connected) setNotice(""); }, [connected]);
  useEffect(() => {
    if (window.location.pathname === "/connect/mobile" && /^#id=[0-9a-f]{32}&token=[0-9a-f]{64}$/.test(window.location.hash)) {
      setIncomingLink(window.location.origin + window.location.pathname + window.location.hash);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);
  useEffect(() => {
    if (!pending || !wallet) return;
    const clearPending = () => { pendingRef.current = null; setPending(null); setQr(""); };
    return observeMobilePair(pending, {
      connected: (session) => { wallet.connectPeopleMobile(session, pending.browserToken); clearPending(); setError(false); setNotice(c.connected); onConnected?.(); },
      expired: () => { clearPending(); setNotice(c.expired); },
      invalid: () => { clearPending(); setError(true); },
      retrying: () => setError(true),
    });
  }, [pending, wallet, c, onConnected]);
  useEffect(() => () => {
    const value = pendingRef.current;
    if (value) void mobileWalletApi({ action: "disconnect", id: value.id, role: "browser", token: value.browserToken }).catch(() => {});
  }, []);
  async function start() {
    setBusy(true); setError(false); setNotice("");
    try {
      const next = await mobileWalletApi({ action: "create" }) as Pending;
      pendingRef.current = next; setPending(next);
      const QR = await import("qrcode"); setQr(await QR.toDataURL(next.link, { width: 260, margin: 2 }));
    } catch { setError(true); } finally { setBusy(false); }
  }
  async function cancel() {
    const value = pending; setPending(null); setQr(""); pendingRef.current = null;
    if (value) { try { await mobileWalletApi({ action: "disconnect", id: value.id, role: "browser", token: value.browserToken }); } catch { setError(true); } }
  }
  async function sign() {
    if (!wallet?.signer) return;
    setBusy(true); setError(false); setNotice(c.pending);
    try { await signViaActiveSigner(wallet.signer, `${c.message}\nNonce: ${crypto.randomUUID()}`); setNotice(c.signed); }
    catch { setError(true); setNotice(""); } finally { setBusy(false); }
  }
  if (!wallet) return null;
  if (incomingLink) return <section className="space-y-4 rounded-2xl border border-line p-5"><h2 className="text-lg font-semibold">{c.title}</h2><p>{c.scan}</p><button className="rounded-xl bg-brand px-4 py-3 text-brand-ink" onClick={() => void navigator.clipboard.writeText(incomingLink).then(() => setNotice(c.copied)).catch(() => setError(true))}>{c.copy}</button>{notice ? <p role="status">{notice}</p> : null}{error ? <p role="alert">{c.error}</p> : null}</section>;
  return <section className="space-y-3 rounded-2xl border border-line bg-surface p-4" data-testid="people-mobile-connect">
    <h2 className="text-lg font-semibold">{c.title}</h2><p className="text-sm text-ink-2">{c.intro}</p>
    {connected ? <><p>{c.connected}</p><p className="break-all font-mono text-xs" dir="ltr">{wallet.signer?.address}</p><p className="text-sm text-ink-2">{c.duration}</p>{diagnostic ? <button className="rounded-xl bg-brand px-4 py-3 text-brand-ink" disabled={busy} onClick={() => void sign()}>{c.sign}</button> : null}<button className="rounded-xl border border-line px-4 py-3" onClick={wallet.disconnect}>{c.disconnect}</button></> : pending ? <><p>{c.waiting}</p><p className="text-sm">{c.code}</p><p className="font-mono" dir="ltr">{pending.id.slice(0, 8).toUpperCase()}</p>{qr ? <picture><img src={qr} alt="PEOPLE Wallet connection QR" width={260} height={260} /></picture> : null}<p className="text-sm text-ink-2">{c.scan}</p><button className="rounded-xl border border-line px-4 py-3" onClick={() => void navigator.clipboard.writeText(pending.link).then(() => setNotice(c.copied)).catch(() => setError(true))}>{c.copy}</button><button className="rounded-xl border border-line px-4 py-3" onClick={() => void cancel()}>{c.cancel}</button></> : <button className="rounded-xl bg-brand px-4 py-3 text-brand-ink" disabled={busy} onClick={() => void start()}>{c.start}</button>}
    {notice ? <p role="status">{notice}</p> : null}{error ? <p role="alert" className="text-sm text-warm">{c.error}</p> : null}
  </section>;
}
