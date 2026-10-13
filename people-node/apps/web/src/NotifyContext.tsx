import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { usePrefs } from "./PrefsContext.js";

export type NotifyKind = "error" | "success" | "info";

export interface NotifyOptions {
  kind?: NotifyKind;
  title?: string;
  message: string;
}

interface NotifyItem {
  id: number;
  kind: NotifyKind;
  title: string;
  message: string;
}

interface NotifyContextValue {
  notify: (options: NotifyOptions | string) => void;
  error: (message: string, title?: string) => void;
  success: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  clear: () => void;
}

const NotifyContext = createContext<NotifyContextValue | null>(null);

let notifyId = 0;

export function NotifyProvider({ children }: { children: ReactNode }) {
  const { t } = usePrefs();
  const [current, setCurrent] = useState<NotifyItem | null>(null);
  const queueRef = useRef<NotifyItem[]>([]);

  const showNext = useCallback(() => {
    setCurrent((active) => {
      if (active) {
        return active;
      }
      const next = queueRef.current.shift() ?? null;
      return next;
    });
  }, []);

  const enqueue = useCallback(
    (options: NotifyOptions | string) => {
      const normalized: NotifyOptions =
        typeof options === "string" ? { message: options, kind: "info" } : options;
      const kind = normalized.kind ?? "info";
      const title =
        normalized.title ??
        (kind === "error" ? t.notifyErrorTitle : kind === "success" ? t.notifySuccessTitle : t.notifyInfoTitle);
      queueRef.current.push({
        id: ++notifyId,
        kind,
        title,
        message: normalized.message
      });
      showNext();
    },
    [showNext, t.notifyErrorTitle, t.notifyInfoTitle, t.notifySuccessTitle]
  );

  const clear = useCallback(() => {
    setCurrent(null);
    queueRef.current = [];
  }, []);

  const dismiss = useCallback(() => {
    setCurrent(null);
  }, []);

  useEffect(() => {
    if (current) {
      return;
    }
    if (queueRef.current.length === 0) {
      return;
    }
    const frame = window.requestAnimationFrame(() => showNext());
    return () => window.cancelAnimationFrame(frame);
  }, [current, showNext]);

  const value = useMemo<NotifyContextValue>(
    () => ({
      notify: enqueue,
      error: (message, title) => enqueue({ kind: "error", message, title }),
      success: (message, title) => enqueue({ kind: "success", message, title }),
      info: (message, title) => enqueue({ kind: "info", message, title }),
      clear
    }),
    [clear, enqueue]
  );

  return (
    <NotifyContext.Provider value={value}>
      {children}
      <NotifyDialog
        item={current}
        dismissLabel={t.notifyDismiss}
        onDismiss={dismiss}
      />
    </NotifyContext.Provider>
  );
}

export function useNotify(): NotifyContextValue {
  const ctx = useContext(NotifyContext);
  if (!ctx) {
    throw new Error("useNotify must be used within NotifyProvider");
  }
  return ctx;
}

function NotifyDialog({
  item,
  dismissLabel,
  onDismiss
}: {
  item: NotifyItem | null;
  dismissLabel: string;
  onDismiss: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!item) {
      return;
    }
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => buttonRef.current?.focus());

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismissRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [item]);

  if (!item) {
    return null;
  }

  return (
    <div className="confirm-backdrop notify-backdrop" role="presentation" onClick={onDismiss}>
      <section
        ref={dialogRef}
        className={`confirm-dialog card notify-dialog notify-dialog--${item.kind}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <p className={`notify-dialog__kind notify-dialog__kind--${item.kind}`} aria-hidden="true">
          {item.kind === "error" ? "!" : item.kind === "success" ? "✓" : "i"}
        </p>
        <h3 id={titleId}>{item.title}</h3>
        <div className="confirm-dialog__body" role="status" aria-live={item.kind === "error" ? "assertive" : "polite"}>
          {item.message}
        </div>
        <div className="link-row">
          <button ref={buttonRef} type="button" onClick={onDismiss}>
            {dismissLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
