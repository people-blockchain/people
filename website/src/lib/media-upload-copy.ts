/**
 * Copy for direct media upload errors. EN is the base; every locale file is complete.
 */

import type { Language } from "./preferences.ts";
import en from "./locales/surfaces/media-upload-en.json" with { type: "json" };
import ru from "./locales/surfaces/media-upload-ru.json" with { type: "json" };
import es from "./locales/surfaces/media-upload-es.json" with { type: "json" };
import pt from "./locales/surfaces/media-upload-pt.json" with { type: "json" };
import fr from "./locales/surfaces/media-upload-fr.json" with { type: "json" };
import de from "./locales/surfaces/media-upload-de.json" with { type: "json" };
import it from "./locales/surfaces/media-upload-it.json" with { type: "json" };
import tr from "./locales/surfaces/media-upload-tr.json" with { type: "json" };
import vi from "./locales/surfaces/media-upload-vi.json" with { type: "json" };
import id from "./locales/surfaces/media-upload-id.json" with { type: "json" };
import zh from "./locales/surfaces/media-upload-zh.json" with { type: "json" };
import ar from "./locales/surfaces/media-upload-ar.json" with { type: "json" };

export type MediaUploadCopy = typeof en;

const rawByLanguage: Record<Language, MediaUploadCopy> = { en, ru, es, pt, fr, de, it, tr, vi, id, zh, ar };

export const mediaUploadCopy: Record<Language, MediaUploadCopy> = rawByLanguage;

const MESSAGE_KEY = {
  file_too_large: "fileTooLarge",
  unsupported_format: "unsupportedFormat",
  link_expired: "linkExpired",
  sha256_mismatch: "sha256Mismatch",
  rate_limited: "rateLimited",
  network: "network",
  wallet_rejected: "walletRejected",
  nonce_used: "nonceUsed",
  nonce_expired: "nonceExpired",
  nonce_missing: "nonceMissing",
  content_mismatch: "contentMismatch",
  size_mismatch: "sizeMismatch",
  storage_unavailable: "storageUnavailable",
  pin_failed: "pinFailed",
  bad_signature: "badSignature",
  verify_unavailable: "verifyUnavailable",
  invalid_request: "invalidRequest",
} as const satisfies Record<string, keyof MediaUploadCopy>;

export type MediaUploadMessageCode = keyof typeof MESSAGE_KEY;

export function mediaUploadMessage(lang: Language, code: MediaUploadMessageCode): string {
  return mediaUploadCopy[lang][MESSAGE_KEY[code]];
}
