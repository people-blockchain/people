export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Listener = (event: BeforeInstallPromptEvent | null) => void;

let deferred: BeforeInstallPromptEvent | null = null;
let captureStarted = false;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) {
    listener(deferred);
  }
}

/** Call once from main.tsx before React mounts — the browser fires this only once. */
export function initPwaInstallCapture(): void {
  if (captureStarted || typeof window === "undefined") {
    return;
  }
  captureStarted = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    emit();
  });

  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

export function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferred;
}

export function subscribeInstallPrompt(listener: Listener): () => void {
  listeners.add(listener);
  listener(deferred);
  return () => {
    listeners.delete(listener);
  };
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const media = window.matchMedia("(display-mode: standalone)");
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return media.matches || Boolean(nav.standalone);
}

/** Safari / iOS never fire beforeinstallprompt — guide users to Share → Add to Home Screen. */
export function isIosLike(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua)) {
    return true;
  }
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}
