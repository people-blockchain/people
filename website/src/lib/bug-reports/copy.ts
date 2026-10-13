import type { Language } from "@/lib/preferences";

export type BugReportCopy = {
  fabLabel: string;
  dialogTitle: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  screenshotLabel: string;
  captureScreenshot: string;
  retakeScreenshot: string;
  capturing: string;
  submit: string;
  submitting: string;
  cancel: string;
  close: string;
  errorRequired: string;
  errorTooLong: string;
  errorScreenshot: string;
  errorRateLimited: string;
  errorSubmit: string;
  thanks: string;
  myReportsTitle: string;
  myReportsEmpty: string;
  myReportsReward: string;
  statusNew: string;
  statusAccepted: string;
  statusDuplicate: string;
  statusFixed: string;
  statusRejected: string;
  supportLink: string;
};

const en: BugReportCopy = {
  fabLabel: "Report a bug",
  dialogTitle: "Report a bug",
  descriptionLabel: "What went wrong?",
  descriptionPlaceholder: "Describe what you were doing and what happened…",
  screenshotLabel: "Screenshot",
  captureScreenshot: "Capture screenshot",
  retakeScreenshot: "Retake screenshot",
  capturing: "Capturing…",
  submit: "Submit report",
  submitting: "Submitting…",
  cancel: "Cancel",
  close: "Close",
  errorRequired: "Please describe the bug",
  errorTooLong: "Description is too long (max 4000 characters)",
  errorScreenshot: "Could not capture screenshot",
  errorRateLimited: "Too many reports — please try again later",
  errorSubmit: "Could not submit report",
  thanks: "Thanks! We'll review your report shortly.",
  myReportsTitle: "My bug reports",
  myReportsEmpty: "You haven't reported any bugs yet.",
  myReportsReward: "Reward",
  statusNew: "New",
  statusAccepted: "Accepted",
  statusDuplicate: "Duplicate",
  statusFixed: "Fixed",
  statusRejected: "Rejected",
  supportLink: "Support",
};

const ru: BugReportCopy = {
  fabLabel: "Сообщить об ошибке",
  dialogTitle: "Сообщить об ошибке",
  descriptionLabel: "Что пошло не так?",
  descriptionPlaceholder: "Опишите, что вы делали и что произошло…",
  screenshotLabel: "Скриншот",
  captureScreenshot: "Сделать скриншот",
  retakeScreenshot: "Переснять скриншот",
  capturing: "Снимаем…",
  submit: "Отправить отчёт",
  submitting: "Отправка…",
  cancel: "Отмена",
  close: "Закрыть",
  errorRequired: "Опишите проблему",
  errorTooLong: "Описание слишком длинное (максимум 4000 символов)",
  errorScreenshot: "Не удалось сделать скриншот",
  errorRateLimited: "Слишком много отчётов — попробуйте позже",
  errorSubmit: "Не удалось отправить отчёт",
  thanks: "Спасибо! Мы скоро рассмотрим ваш отчёт.",
  myReportsTitle: "Мои отчёты об ошибках",
  myReportsEmpty: "Вы пока не сообщали об ошибках.",
  myReportsReward: "Награда",
  statusNew: "Новый",
  statusAccepted: "Принят",
  statusDuplicate: "Дубликат",
  statusFixed: "Исправлен",
  statusRejected: "Отклонён",
  supportLink: "Поддержка",
};

const baseBugReportCopy: Partial<Record<Language, BugReportCopy>> = { en, ru };

/** Any locale without its own entry falls back to `en` (existing wallet-copy.ts pattern). */
export const bugReportCopy: Record<Language, BugReportCopy> = new Proxy(
  baseBugReportCopy as Record<Language, BugReportCopy>,
  {
    get: (target, prop: string) => target[prop as Language] ?? target.en,
  },
);
