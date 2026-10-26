import type { Language } from "../preferences";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.peopleblockchain.network";
import partnerAr from "../locales/surfaces/partner-ar.json" with { type: "json" };
import partnerDe from "../locales/surfaces/partner-de.json" with { type: "json" };
import partnerEn from "../locales/surfaces/partner-en.json" with { type: "json" };
import partnerEs from "../locales/surfaces/partner-es.json" with { type: "json" };
import partnerFr from "../locales/surfaces/partner-fr.json" with { type: "json" };
import partnerId from "../locales/surfaces/partner-id.json" with { type: "json" };
import partnerIt from "../locales/surfaces/partner-it.json" with { type: "json" };
import partnerPt from "../locales/surfaces/partner-pt.json" with { type: "json" };
import partnerRu from "../locales/surfaces/partner-ru.json" with { type: "json" };
import partnerTr from "../locales/surfaces/partner-tr.json" with { type: "json" };
import partnerVi from "../locales/surfaces/partner-vi.json" with { type: "json" };
import partnerZh from "../locales/surfaces/partner-zh.json" with { type: "json" };

const LOGO_URL = `${SITE_URL.replace(/\/$/, "")}/brand/icon-192.png`;

type MagicLinkStrings = Pick<
  typeof partnerEn,
  | "magicLinkSubject"
  | "magicLinkHeading"
  | "magicLinkBody"
  | "magicLinkCta"
  | "magicLinkCopyUrl"
  | "magicLinkIgnore"
>;

const magicLinkCopy: Record<Language, MagicLinkStrings> = {
  en: partnerEn,
  es: partnerEs,
  pt: partnerPt,
  fr: partnerFr,
  de: partnerDe,
  it: partnerIt,
  tr: partnerTr,
  vi: partnerVi,
  id: partnerId,
  zh: partnerZh,
  ar: partnerAr,
  ru: partnerRu,
};

const VALID_LANGS = new Set<Language>(Object.keys(magicLinkCopy) as Language[]);

export function resolveMagicLinkLocale(acceptLanguage: string | null | undefined): Language {
  if (!acceptLanguage) return "en";
  for (const part of acceptLanguage.split(",")) {
    const tag = part.trim().split(";")[0]?.toLowerCase() ?? "";
    if (!tag) continue;
    const primary = tag.split("-")[0] as Language;
    if (VALID_LANGS.has(primary)) return primary;
  }
  return "en";
}

export function renderMagicLinkEmail(input: {
  url: string;
  host: string;
  locale?: Language;
}): { subject: string; html: string; text: string } {
  const lang = input.locale ?? "en";
  const t = magicLinkCopy[lang] ?? magicLinkCopy.en;
  const subject = t.magicLinkSubject;
  const heading = t.magicLinkHeading;
  const body = t.magicLinkBody;
  const cta = t.magicLinkCta;
  const ignore = t.magicLinkIgnore;
  const copyUrl = t.magicLinkCopyUrl;

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#07090e;color:#f2f6fb;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#07090e;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#0d1119;border:1px solid rgba(148,163,184,0.16);border-radius:16px;padding:32px;">
          <tr>
            <td align="center" style="padding-bottom:20px;">
              <img src="${LOGO_URL}" width="48" height="48" alt="PEOPLE" style="display:block;border-radius:12px;" />
            </td>
          </tr>
          <tr>
            <td>
              <h1 style="margin:0 0 16px;font-size:22px;line-height:1.2;color:#f2f6fb;text-align:center;">${heading}</h1>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#bcc7d6;">
                ${body}
              </p>
              <p style="margin:0 0 28px;text-align:center;">
                <a href="${input.url}" style="display:inline-block;background:#38bdf8;color:#04121c;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:10px;">${cta}</a>
              </p>
              <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#8b99ad;">
                ${copyUrl}
              </p>
              <p style="margin:0 0 24px;font-size:12px;line-height:1.5;word-break:break-all;color:#38bdf8;">${input.url}</p>
              <p style="margin:0;font-size:12px;line-height:1.5;color:#8b99ad;">
                ${ignore} (${input.host})
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  const text = [heading, "", body, "", input.url, "", `${ignore} (${input.host})`].join("\n");
  return { subject, html, text };
}
