"use client";

import { useLanguage } from "@/context/LanguageContext";

export const GITHUB_URL = "https://github.com/people-blockchain/people-blockchain";

type GithubIconProps = {
  className?: string;
};

function GithubIcon({ className }: GithubIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.08 0 4.41-2.69 5.38-5.25 5.67.41.35.78 1.05.78 2.12 0 1.53-.01 2.76-.01 3.14 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
    </svg>
  );
}

const copy: Record<string, { line: string; aria: string }> = {
  en: {
    line: "Open source (Apache-2.0) — read and verify it on GitHub",
    aria: "People Blockchain on GitHub",
  },
  ru: {
    line: "Открытый код (Apache-2.0) — изучайте и проверяйте на GitHub",
    aria: "People Blockchain на GitHub",
  },
  ar: {
    line: "مفتوح المصدر (Apache-2.0) — اقرأه وتحقق منه على GitHub",
    aria: "People Blockchain على GitHub",
  },
  de: {
    line: "Open Source (Apache-2.0) — auf GitHub lesen und überprüfen",
    aria: "People Blockchain auf GitHub",
  },
  es: {
    line: "Código abierto (Apache-2.0) — léelo y verifícalo en GitHub",
    aria: "People Blockchain en GitHub",
  },
  fr: {
    line: "Open source (Apache-2.0) — à lire et à vérifier sur GitHub",
    aria: "People Blockchain sur GitHub",
  },
  id: {
    line: "Sumber terbuka (Apache-2.0) — baca dan verifikasi di GitHub",
    aria: "People Blockchain di GitHub",
  },
  it: {
    line: "Open source (Apache-2.0) — leggilo e verificalo su GitHub",
    aria: "People Blockchain su GitHub",
  },
  pt: {
    line: "Código aberto (Apache-2.0) — leia e verifique no GitHub",
    aria: "People Blockchain no GitHub",
  },
  tr: {
    line: "Açık kaynak (Apache-2.0) — GitHub'da okuyun ve doğrulayın",
    aria: "GitHub'da People Blockchain",
  },
  vi: {
    line: "Mã nguồn mở (Apache-2.0) — đọc và xác minh trên GitHub",
    aria: "People Blockchain trên GitHub",
  },
  zh: {
    line: "开源（Apache-2.0）——在 GitHub 上阅读并验证",
    aria: "GitHub 上的 People Blockchain",
  },
};

export function GithubNavLink({ className }: { className?: string }) {
  const { lang } = useLanguage();
  const t = copy[lang] ?? copy.en;

  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t.aria}
      title={t.aria}
      className={
        "inline-flex items-center justify-center rounded-lg p-2 text-ink-2 transition hover:bg-surface-2 hover:text-ink" +
        (className ? " " + className : "")
      }
    >
      <GithubIcon className="h-5 w-5" />
    </a>
  );
}

export function OpenSourceLine({ className }: { className?: string }) {
  const { lang } = useLanguage();
  const t = copy[lang] ?? copy.en;

  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t.aria}
      title={t.aria}
      data-testid="open-source-line"
      className={
        "inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs font-medium text-ink-2 transition hover:border-brand hover:text-ink" +
        (className ? " " + className : "")
      }
    >
      <GithubIcon className="h-4 w-4" />
      <span>{t.line}</span>
    </a>
  );
}
