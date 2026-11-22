"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, Send, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { Language } from "@/lib/preferences";
import { fetchAuthSessionUser } from "@/lib/wallet-cloud-client";

const POLL_INTERVAL_MS = 30_000;
const MAX_LEN = 2000;
const HIDDEN_ON_PREFIXES = ["/login", "/admin"];

type ChatMessage = {
  id: string;
  senderRole: "user" | "bot" | "agent";
  senderName: string | null;
  body: string;
  createdAt: string;
};

type ChatPayload = { thread: { id: string; status: string } | null; messages: ChatMessage[] };

type Phase = "checking" | "guest" | "loading" | "ready" | "error";

type CopyShape = {
  title: string;
  subtitle: string;
  open: string;
  close: string;
  greeting: string;
  placeholder: string;
  send: string;
  guestTitle: string;
  guestBody: string;
  guestCta: string;
  loadError: string;
  sendError: string;
  rateLimited: string;
  escalated: string;
  you: string;
};

const COPY: Record<Language, CopyShape> = {
  en: {
    title: "PEOPLE Support",
    subtitle: "We usually reply within a few hours",
    open: "Open support chat",
    close: "Close support chat",
    greeting: "Hi! 👋 Ask us anything about PEOPLE and we will get back to you here.",
    placeholder: "Write a message…",
    send: "Send",
    guestTitle: "Sign in to chat with us",
    guestBody: "Live support is free for registered users. Sign in and we will be right here.",
    guestCta: "Sign in",
    loadError: "Could not load the chat. Please try again.",
    sendError: "Message not sent. Please try again.",
    rateLimited: "Too many messages. Please wait a moment.",
    escalated: "A team member has been notified and will reply here.",
    you: "You",
  },
  es: {
    title: "PEOPLE Support",
    subtitle: "Solemos responder en unas pocas horas",
    open: "Abrir chat de soporte",
    close: "Cerrar chat de soporte",
    greeting: "¡Hola! 👋 Pregúntanos lo que quieras sobre PEOPLE y te responderemos aquí.",
    placeholder: "Escribe un mensaje…",
    send: "Enviar",
    guestTitle: "Inicia sesión para chatear con nosotros",
    guestBody: "El soporte en vivo es gratuito para usuarios registrados. Inicia sesión y estaremos aquí.",
    guestCta: "Iniciar sesión",
    loadError: "No se pudo cargar el chat. Por favor, inténtalo de nuevo.",
    sendError: "Mensaje no enviado. Por favor, inténtalo de nuevo.",
    rateLimited: "Demasiados mensajes. Por favor, espera un momento.",
    escalated: "Un miembro del equipo ha sido notificado y responderá aquí.",
    you: "Tú",
  },
  pt: {
    title: "PEOPLE Support",
    subtitle: "Geralmente respondemos em algumas horas",
    open: "Abrir chat de suporte",
    close: "Fechar chat de suporte",
    greeting: "Olá! 👋 Pergunte qualquer coisa sobre o PEOPLE e responderemos aqui.",
    placeholder: "Escreva uma mensagem…",
    send: "Enviar",
    guestTitle: "Inicie sessão para conversar conosco",
    guestBody: "O suporte ao vivo é gratuito para usuários registrados. Inicie sessão e estaremos aqui.",
    guestCta: "Iniciar sessão",
    loadError: "Não foi possível carregar o chat. Tente novamente.",
    sendError: "Mensagem não enviada. Tente novamente.",
    rateLimited: "Muitas mensagens. Por favor, aguarde um momento.",
    escalated: "Um membro da equipe foi notificado e responderá aqui.",
    you: "Você",
  },
  fr: {
    title: "PEOPLE Support",
    subtitle: "Nous répondons généralement en quelques heures",
    open: "Ouvrir le chat d'assistance",
    close: "Fermer le chat d'assistance",
    greeting: "Bonjour ! 👋 Posez-nous vos questions sur PEOPLE et nous vous répondrons ici.",
    placeholder: "Écrivez un message…",
    send: "Envoyer",
    guestTitle: "Connectez-vous pour discuter avec nous",
    guestBody: "L'assistance en direct est gratuite pour les utilisateurs inscrits. Connectez-vous et nous serons là.",
    guestCta: "Se connecter",
    loadError: "Impossible de charger le chat. Veuillez réessayer.",
    sendError: "Message non envoyé. Veuillez réessayer.",
    rateLimited: "Trop de messages. Veuillez patienter un moment.",
    escalated: "Un membre de l'équipe a été averti et vous répondra ici.",
    you: "Vous",
  },
  de: {
    title: "PEOPLE Support",
    subtitle: "Wir antworten normalerweise innerhalb weniger Stunden",
    open: "Support-Chat öffnen",
    close: "Support-Chat schließen",
    greeting: "Hallo! 👋 Frag uns alles über PEOPLE und wir antworten dir hier.",
    placeholder: "Nachricht schreiben…",
    send: "Senden",
    guestTitle: "Anmelden, um mit uns zu chatten",
    guestBody: "Der Live-Support ist für registrierte Benutzer kostenlos. Melden Sie sich an und wir sind da.",
    guestCta: "Anmelden",
    loadError: "Chat konnte nicht geladen werden. Bitte versuche es erneut.",
    sendError: "Nachricht nicht gesendet. Bitte versuche es erneut.",
    rateLimited: "Zu viele Nachrichten. Bitte warte einen Moment.",
    escalated: "Ein Teammitglied wurde benachrichtigt und wird hier antworten.",
    you: "Du",
  },
  it: {
    title: "PEOPLE Support",
    subtitle: "Di solito rispondiamo entro poche ore",
    open: "Apri chat di supporto",
    close: "Chiudi chat di supporto",
    greeting: "Ciao! 👋 Chiedici qualsiasi cosa su PEOPLE e ti risponderemo qui.",
    placeholder: "Scrivi un messaggio…",
    send: "Invia",
    guestTitle: "Accedi per chattare con noi",
    guestBody: "Il supporto live è gratuito per gli utenti registrati. Accedi e saremo subito qui.",
    guestCta: "Accedi",
    loadError: "Impossibile caricare la chat. Riprova.",
    sendError: "Messaggio non inviato. Riprova.",
    rateLimited: "Troppi messaggi. Attendi un momento.",
    escalated: "Un membro del team è stato avvisato e risponderà qui.",
    you: "Tu",
  },
  tr: {
    title: "PEOPLE Support",
    subtitle: "Genellikle birkaç saat içinde yanıt veriyoruz",
    open: "Destek sohbetini aç",
    close: "Destek sohbetini kapat",
    greeting: "Merhaba! 👋 PEOPLE hakkında dilediğinizi sorun, buradan yanıtlayalım.",
    placeholder: "Bir mesaj yazın…",
    send: "Gönder",
    guestTitle: "Bizimle sohbet etmek için giriş yapın",
    guestBody: "Canlı destek kayıtlı kullanıcılar için ücretsizdir. Giriş yapın, hemen yardımcı olalım.",
    guestCta: "Giriş yap",
    loadError: "Sohbet yüklenemedi. Lütfen tekrar deneyin.",
    sendError: "Mesaj gönderilemedi. Lütfen tekrar deneyin.",
    rateLimited: "Çok fazla mesaj gönderildi. Lütfen biraz bekleyin.",
    escalated: "Ekip üyemiz bilgilendirildi ve buradan yanıt verecektir.",
    you: "Sen",
  },
  vi: {
    title: "PEOPLE Support",
    subtitle: "Chúng tôi thường phản hồi trong vòng vài giờ",
    open: "Mở trò chuyện hỗ trợ",
    close: "Đóng trò chuyện hỗ trợ",
    greeting: "Xin chào! 👋 Hãy hỏi bất cứ điều gì về PEOPLE và chúng tôi sẽ trả lời tại đây.",
    placeholder: "Viết tin nhắn…",
    send: "Gửi",
    guestTitle: "Đăng nhập để trò chuyện với chúng tôi",
    guestBody: "Hỗ trợ trực tuyến miễn phí cho người dùng đã đăng ký. Hãy đăng nhập và chúng tôi sẵn sàng hỗ trợ.",
    guestCta: "Đăng nhập",
    loadError: "Không thể tải cuộc trò chuyện. Vui lòng thử lại.",
    sendError: "Tin nhắn chưa được gửi. Vui lòng thử lại.",
    rateLimited: "Quá nhiều tin nhắn. Vui lòng chờ trong giây lát.",
    escalated: "Một thành viên trong nhóm đã được thông báo và sẽ phản hồi tại đây.",
    you: "Bạn",
  },
  id: {
    title: "PEOPLE Support",
    subtitle: "Kami biasanya membalas dalam beberapa jam",
    open: "Buka obrolan dukungan",
    close: "Tutup obrolan dukungan",
    greeting: "Halo! 👋 Tanyakan apa saja tentang PEOPLE dan kami akan menjawab di sini.",
    placeholder: "Tulis pesan…",
    send: "Kirim",
    guestTitle: "Masuk untuk mengobrol dengan kami",
    guestBody: "Dukungan langsung gratis untuk pengguna terdaftar. Masuk dan kami akan siap membantu.",
    guestCta: "Masuk",
    loadError: "Gagal memuat obrolan. Silakan coba lagi.",
    sendError: "Pesan tidak terkirim. Silakan coba lagi.",
    rateLimited: "Terlalu banyak pesan. Mohon tunggu sebentar.",
    escalated: "Anggota tim kami telah diberitahu dan akan membalas di sini.",
    you: "Anda",
  },
  zh: {
    title: "PEOPLE Support",
    subtitle: "我们通常在几小时内回复",
    open: "打开客服聊天",
    close: "关闭客服聊天",
    greeting: "你好！👋 有任何关于 PEOPLE 的问题都可以问我们，我们会在这里回复。",
    placeholder: "输入消息…",
    send: "发送",
    guestTitle: "登录以与我们聊天",
    guestBody: "注册用户可享受免费实时客服支持。登录后我们随时为您服务。",
    guestCta: "登录",
    loadError: "无法加载聊天。请重试。",
    sendError: "消息未能发送。请重试。",
    rateLimited: "发送频率过高，请稍候。",
    escalated: "已通知团队成员，将在此回复您。",
    you: "你",
  },
  ar: {
    title: "PEOPLE Support",
    subtitle: "عادةً ما نرد خلال بضع ساعات",
    open: "فتح محادثة الدعم",
    close: "إغلاق محادثة الدعم",
    greeting: "مرحباً! 👋 اسألنا عن أي شيء يخص PEOPLE وسنرد عليك هنا.",
    placeholder: "اكتب رسالة…",
    send: "إرسال",
    guestTitle: "سجّل الدخول لتتحدث معنا",
    guestBody: "الدعم المباشر مجاني للمستخدمين المسجلين. سجّل الدخول وسنكون هنا فوراً.",
    guestCta: "تسجيل الدخول",
    loadError: "تعذر تحميل المحادثة. يُرجى المحاولة مرة أخرى.",
    sendError: "لم يتم إرسال الرسالة. يُرجى المحاولة مرة أخرى.",
    rateLimited: "رسائل كثيرة جداً. يُرجى الانتظار قليلاً.",
    escalated: "تم إخطار أحد أعضاء الفريق وسيرد عليك هنا.",
    you: "أنت",
  },
  ru: {
    title: "PEOPLE Support",
    subtitle: "Обычно отвечаем в течение нескольких часов",
    open: "Открыть чат поддержки",
    close: "Закрыть чат поддержки",
    greeting: "Привет! 👋 Спросите нас о PEOPLE — ответим прямо здесь.",
    placeholder: "Напишите сообщение…",
    send: "Отправить",
    guestTitle: "Войдите, чтобы написать нам",
    guestBody: "Живая поддержка бесплатна для зарегистрированных пользователей. Войдите — и мы на связи.",
    guestCta: "Войти",
    loadError: "Не удалось загрузить чат. Попробуйте ещё раз.",
    sendError: "Сообщение не отправлено. Попробуйте ещё раз.",
    rateLimited: "Слишком много сообщений. Подождите немного.",
    escalated: "Сотрудник уведомлён и ответит здесь.",
    you: "Вы",
  },
};

function copyFor(lang: string): CopyShape {
  return COPY[lang as Language] ?? COPY.en;
}

/** Cheerful PEOPLE-style mascot: a round smiling face with two little raised hands. */
function Mascot({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-hidden="true" focusable="false">
      <circle cx="32" cy="34" r="22" className="fill-current" />
      <circle cx="23" cy="30" r="3.2" fill="#fff" />
      <circle cx="41" cy="30" r="3.2" fill="#fff" />
      <circle cx="23.8" cy="30.6" r="1.4" fill="#1b1b1f" />
      <circle cx="41.8" cy="30.6" r="1.4" fill="#1b1b1f" />
      <path d="M21 40c3 6 19 6 22 0" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="16" cy="38" r="3" fill="#ff9aa8" opacity="0.7" />
      <circle cx="48" cy="38" r="3" fill="#ff9aa8" opacity="0.7" />
      <circle cx="10" cy="18" r="5" className="fill-current" />
      <circle cx="54" cy="18" r="5" className="fill-current" />
      <path d="M12 22l5 8M52 22l-5 8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function SupportChatWidget() {
  const pathname = usePathname();
  const { lang } = useLanguage();
  const t = copyFor(lang);

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("checking");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadStatus, setThreadStatus] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/support/chat", { credentials: "include", cache: "no-store" });
      if (res.status === 401) {
        setPhase("guest");
        return;
      }
      if (!res.ok) {
        setPhase((p) => (p === "ready" ? p : "error"));
        return;
      }
      const data = (await res.json()) as ChatPayload;
      setMessages(data.messages);
      setThreadStatus(data.thread?.status ?? null);
      setPhase("ready");
    } catch {
      setPhase((p) => (p === "ready" ? p : "error"));
    } finally {
      inFlight.current = false;
    }
  }, []);

  // Opening the chat: check the client session first (guests never reach the chat API).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPhase("checking");
    setError(null);
    fetchAuthSessionUser()
      .then((user) => {
        if (cancelled) return;
        if (!user) {
          setPhase("guest");
          return;
        }
        setPhase("loading");
        void refresh();
      })
      .catch(() => {
        if (!cancelled) setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [open, refresh]);

  // Light polling: only while the widget is open, signed in, and the tab is visible.
  const polling = open && (phase === "ready" || phase === "loading");
  useEffect(() => {
    if (!polling) return;
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [polling, refresh]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, phase]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/support/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (res.status === 401) {
        setPhase("guest");
        return;
      }
      if (res.status === 429) {
        setError(t.rateLimited);
        return;
      }
      if (!res.ok) {
        setError(t.sendError);
        return;
      }
      const data = (await res.json()) as { message: ChatMessage; thread: { status: string } };
      setMessages((prev) => (prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]));
      setThreadStatus(data.thread.status);
      setDraft("");
    } catch {
      setError(t.sendError);
    } finally {
      setSending(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  if (HIDDEN_ON_PREFIXES.some((p) => pathname?.startsWith(p))) return null;

  // The bug button is 2.75rem tall at `max(1rem, safe-area)`; the chat button sits 0.75rem above it.
  const fabBottom = "calc(max(1rem, env(safe-area-inset-bottom)) + 2.75rem + 0.75rem)";
  const panelBottom = "calc(max(1rem, env(safe-area-inset-bottom)) + 2.75rem + 0.75rem + 3.5rem + 0.75rem)";
  const right = "max(1rem, env(safe-area-inset-right))";

  return (
    <>
      {open ? (
        <section
          id="support-chat-panel"
          role="dialog"
          aria-label={t.title}
          className="fixed z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--elev-2,0_12px_40px_rgba(0,0,0,0.25))]"
          style={{ bottom: panelBottom, right, height: "min(30rem, calc(100dvh - 11rem))" }}
        >
          <header className="flex items-center gap-3 bg-brand px-4 py-3 text-brand-ink">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/90 text-brand">
              <Mascot className="h-8 w-8" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight">{t.title}</p>
              <p className="truncate text-xs opacity-80">{t.subtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t.close}
              className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/20"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>

          {phase === "guest" ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <span className="text-brand">
                <Mascot className="h-16 w-16" />
              </span>
              <p className="text-sm font-semibold text-ink">{t.guestTitle}</p>
              <p className="text-sm text-ink-2">{t.guestBody}</p>
              <Link
                href="/login"
                className="inline-flex min-h-10 items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-brand-ink transition hover:brightness-110"
              >
                {t.guestCta}
              </Link>
            </div>
          ) : (
            <>
              <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto bg-canvas-2 px-3 py-3" aria-live="polite">
                {phase === "checking" || phase === "loading" ? (
                  <div className="flex h-full items-center justify-center text-ink-3">
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  </div>
                ) : phase === "error" ? (
                  <p className="text-center text-sm text-warm">{t.loadError}</p>
                ) : (
                  <>
                    <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-surface px-3 py-2 text-sm text-ink shadow-sm">
                      {t.greeting}
                    </div>
                    {messages.map((m) => {
                      const mine = m.senderRole === "user";
                      return (
                        <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                          <div
                            className={
                              mine
                                ? "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-brand px-3 py-2 text-sm text-brand-ink"
                                : "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-surface px-3 py-2 text-sm text-ink shadow-sm"
                            }
                          >
                            {!mine && m.senderName ? (
                              <p className="mb-0.5 text-[11px] font-semibold text-ink-3">{m.senderName}</p>
                            ) : null}
                            {m.body}
                          </div>
                        </div>
                      );
                    })}
                    {threadStatus === "escalated" ? (
                      <p className="px-2 text-center text-xs text-ink-3">{t.escalated}</p>
                    ) : null}
                  </>
                )}
              </div>

              {error ? <p className="bg-surface px-3 pt-2 text-xs text-warm">{error}</p> : null}
              <form onSubmit={onSubmit} className="flex items-end gap-2 border-t border-line bg-surface p-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
                  onKeyDown={onKeyDown}
                  placeholder={t.placeholder}
                  aria-label={t.placeholder}
                  rows={1}
                  maxLength={MAX_LEN}
                  disabled={phase !== "ready"}
                  className="max-h-24 min-h-10 flex-1 resize-none rounded-xl border border-line bg-canvas-2 px-3 py-2 text-sm text-ink disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={sending || phase !== "ready" || !draft.trim()}
                  aria-label={t.send}
                  title={t.send}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-brand-ink transition hover:brightness-110 disabled:opacity-50"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </form>
            </>
          )}
        </section>
      ) : null}

      <button
        id="support-chat-fab"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? t.close : t.open}
        aria-expanded={open}
        aria-controls="support-chat-panel"
        title={t.open}
        className="fixed z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-brand-ink shadow-[var(--elev-1)] transition hover:brightness-110"
        style={{ bottom: fabBottom, right }}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-brand">
          <Mascot className="h-9 w-9" />
        </span>
      </button>
    </>
  );
}
