import { useEffect, useState } from "react";
import { usePrefs } from "./PrefsContext.js";
import { useNotify } from "./NotifyContext.js";
import {
  getDeferredInstallPrompt,
  isIosLike,
  isStandaloneDisplay,
  subscribeInstallPrompt,
  type BeforeInstallPromptEvent
} from "./pwaInstall.js";

export function InstallPwaButton({ className = "ghost" }: { className?: string }) {
  const { t } = usePrefs();
  const notify = useNotify();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(() => getDeferredInstallPrompt());
  const [installed, setInstalled] = useState(() => isStandaloneDisplay());

  useEffect(() => {
    if (isStandaloneDisplay()) {
      setInstalled(true);
    }
    return subscribeInstallPrompt((event) => {
      setDeferred(event);
      if (isStandaloneDisplay()) {
        setInstalled(true);
      }
    });
  }, []);

  async function handleInstall() {
    const promptEvent = deferred ?? getDeferredInstallPrompt();
    if (promptEvent) {
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        setDeferred(null);
        if (choice.outcome === "accepted") {
          setInstalled(true);
          notify.success(t.installPwaDone);
        }
      } catch {
        notify.info(isIosLike() ? t.installPwaIosHint : t.installPwaNotice);
      }
      return;
    }

    notify.info(isIosLike() ? t.installPwaIosHint : t.installPwaNotice);
  }

  if (installed) {
    return (
      <button type="button" className={className} disabled>
        {t.installPwaDone}
      </button>
    );
  }

  return (
    <button type="button" className={className} onClick={() => void handleInstall()} title={t.installPwaHint}>
      {t.installPwa}
    </button>
  );
}
