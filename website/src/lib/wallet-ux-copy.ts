import type { Language } from "./preferences";
import en from "./locales/surfaces/wallet-ux-en.json";
import ru from "./locales/surfaces/wallet-ux-ru.json";
import es from "./locales/surfaces/wallet-ux-es.json";
import pt from "./locales/surfaces/wallet-ux-pt.json";
import fr from "./locales/surfaces/wallet-ux-fr.json";
import de from "./locales/surfaces/wallet-ux-de.json";
import it from "./locales/surfaces/wallet-ux-it.json";
import tr from "./locales/surfaces/wallet-ux-tr.json";
import vi from "./locales/surfaces/wallet-ux-vi.json";
import id from "./locales/surfaces/wallet-ux-id.json";
import zh from "./locales/surfaces/wallet-ux-zh.json";
import ar from "./locales/surfaces/wallet-ux-ar.json";

export const walletUxTranslations: Record<Language, typeof en> = { en, ru, es, pt, fr, de, it, tr, vi, id, zh, ar };
export function walletUxCopy(language: Language) { return walletUxTranslations[language]; }
