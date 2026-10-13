import type { Language } from "@/lib/preferences";
import walletAr from "./locales/surfaces/wallet-ar.json" with { type: "json" };
import walletDe from "./locales/surfaces/wallet-de.json" with { type: "json" };
import walletEs from "./locales/surfaces/wallet-es.json" with { type: "json" };
import walletFr from "./locales/surfaces/wallet-fr.json" with { type: "json" };
import walletId from "./locales/surfaces/wallet-id.json" with { type: "json" };
import walletIt from "./locales/surfaces/wallet-it.json" with { type: "json" };
import walletPt from "./locales/surfaces/wallet-pt.json" with { type: "json" };
import walletTr from "./locales/surfaces/wallet-tr.json" with { type: "json" };
import walletVi from "./locales/surfaces/wallet-vi.json" with { type: "json" };
import walletZh from "./locales/surfaces/wallet-zh.json" with { type: "json" };

export type WalletCopyContent = {
  title: string;
  lead: string;
  create: string;
  import: string;
  unlock: string;
  lock: string;
  password: string;
  passwordConfirm: string;
  passwordHint: string;
  writeDown: string;
  wroteDown: string;
  confirmWords: string;
  wordN: string;
  continue: string;
  back: string;
  mnemonic: string;
  privateKey: string;
  importHint: string;
  receive: string;
  send: string;
  amount: string;
  to: string;
  fee: string;
  copyAddress: string;
  copied: string;
  exportKey: string;
  exportSeed: string;
  forget: string;
  locked: string;
  noWallets: string;
  ppl: string;
  tokens: string;
  nfts: string;
  nonce: string;
  explorer: string;
  factory: string;
  submitted: string;
  error: string;
  networkUnavailable: string;
  networkChecking: string;
  testnet: string;
  minPassword: string;
  faucet: string;
  faucetHint: string;
  faucetOk: string;
  createdConnected: string;
  registrationPending: string;
  signInHeading: string;
  signInGoogle: string;
  signInMagicCta: string;
  signInEmailLabel: string;
  signInEmailPlaceholder: string;
  signInDivider: string;
  signInOpening: string;
  signInUnavailable: string;
  signingIn: string;
  cloudExportHint: string;
  cloudDisconnect: string;
};

const baseWalletCopy: Record<string, WalletCopyContent> = {
  en: {
    title: "People Wallet",
    lead: "Non-custodial. Keys are created in this browser, encrypted with your password, and never sent to our servers.",
    create: "Create a new wallet",
    import: "Import wallet",
    unlock: "Unlock",
    lock: "Lock",
    password: "Password",
    passwordConfirm: "Confirm password",
    passwordHint: "This password stays on this device. We cannot recover it.",
    writeDown: "Write these 12 words on paper. Anyone with them can spend your PPL.",
    wroteDown: "I wrote the phrase down",
    confirmWords: "Type the requested words to confirm you saved the phrase.",
    wordN: "Word",
    continue: "Continue",
    back: "Back",
    mnemonic: "12-word phrase",
    privateKey: "Private key (64 hex)",
    importHint: "Paste a 12-word phrase or a 64-character hex key. Both stay on this device.",
    receive: "Receive",
    send: "Send PPL",
    amount: "Amount",
    to: "To address",
    fee: "Network fee",
    copyAddress: "Copy address",
    copied: "Copied",
    exportKey: "Show private key",
    exportSeed: "Show seed phrase",
    forget: "Remove from this browser",
    locked: "Unlock to send, create tokens, or export keys.",
    noWallets: "No wallet on this device yet.",
    ppl: "PPL",
    tokens: "Tokens",
    nfts: "NFTs",
    nonce: "Nonce",
    explorer: "View on explorer",
    factory: "Create a token or NFT",
    submitted: "Transaction accepted by the node.",
    error: "Could not complete",
    networkUnavailable: "Network temporarily unavailable",
    networkChecking: "Connecting…",
    testnet: "Testnet",
    minPassword: "Use at least 8 characters.",
    faucet: "Get testnet PPL",
    faucetHint: "Testnet faucet only — no real value. Rate-limited.",
    faucetOk: "Testnet PPL sent to this address.",
    createdConnected: "Wallet created and connected to the network.",
    registrationPending: "Connecting to the network — we will retry automatically.",
    signInHeading: "Sign in with Google or email",
    signInGoogle: "Continue with Google",
    signInMagicCta: "Continue with email",
    signInEmailLabel: "Email",
    signInEmailPlaceholder: "you@example.com",
    signInDivider: "Or use a password on this device",
    signInOpening: "Opening your People Wallet…",
    signInUnavailable: "Account wallet sign-in is not available on this deployment.",
    signingIn: "Signing in…",
    cloudExportHint:
      "The same Google or email login restores this wallet on any device. Export the private key only if you need a backup outside People.",
    cloudDisconnect: "Disconnect",
  },
  ru: {
    title: "People Wallet",
    lead: "Некастодиальный. Ключи создаются в браузере, шифруются паролем и не уходят на наши серверы.",
    create: "Создать кошелёк",
    import: "Импортировать",
    unlock: "Разблокировать",
    lock: "Заблокировать",
    password: "Пароль",
    passwordConfirm: "Повторите пароль",
    passwordHint: "Пароль остаётся на этом устройстве. Мы не можем его восстановить.",
    writeDown: "Запишите эти 12 слов на бумагу. У кого есть фраза — может потратить PPL.",
    wroteDown: "Я записал фразу",
    confirmWords: "Введите указанные слова, чтобы подтвердить, что фраза сохранена.",
    wordN: "Слово",
    continue: "Далее",
    back: "Назад",
    mnemonic: "Фраза из 12 слов",
    privateKey: "Приватный ключ (64 hex)",
    importHint: "Вставьте фразу из 12 слов или 64-символьный hex-ключ. Оба остаются на устройстве.",
    receive: "Получить",
    send: "Отправить PPL",
    amount: "Сумма",
    to: "Адрес получателя",
    fee: "Комиссия сети",
    copyAddress: "Скопировать адрес",
    copied: "Скопировано",
    exportKey: "Показать ключ",
    exportSeed: "Показать сид-фразу",
    forget: "Удалить из этого браузера",
    locked: "Разблокируйте, чтобы отправлять, выпускать токены или экспортировать ключи.",
    noWallets: "На этом устройстве кошелька ещё нет.",
    ppl: "PPL",
    tokens: "Токены",
    nfts: "NFT",
    nonce: "Nonce",
    explorer: "Открыть в сканере",
    factory: "Создать токен или NFT",
    submitted: "Нода приняла транзакцию.",
    error: "Не удалось выполнить",
    networkUnavailable: "Сеть временно недоступна",
    networkChecking: "Подключение…",
    testnet: "Testnet",
    minPassword: "Не меньше 8 символов.",
    faucet: "Получить testnet PPL",
    faucetHint: "Только testnet-кран — без реальной стоимости. Есть лимит.",
    faucetOk: "Testnet PPL отправлены на этот адрес.",
    createdConnected: "Кошелёк создан и подключён к сети.",
    registrationPending: "Подключаем к сети — повторим автоматически.",
    signInHeading: "Войти через Google или email",
    signInGoogle: "Продолжить через Google",
    signInMagicCta: "Продолжить через email",
    signInEmailLabel: "Email",
    signInEmailPlaceholder: "you@example.com",
    signInDivider: "Или пароль только на этом устройстве",
    signInOpening: "Открываем People Wallet…",
    signInUnavailable: "Вход в кошелёк по аккаунту недоступен на этом окружении.",
    signingIn: "Вход…",
    cloudExportHint:
      "Тот же Google или email восстановит кошелёк на любом устройстве. Экспортируйте ключ только если нужна копия вне People.",
    cloudDisconnect: "Отключить",
  },
  es: walletEs as WalletCopyContent,
  pt: walletPt as WalletCopyContent,
  fr: walletFr as WalletCopyContent,
  de: walletDe as WalletCopyContent,
  it: walletIt as WalletCopyContent,
  tr: walletTr as WalletCopyContent,
  vi: walletVi as WalletCopyContent,
  id: walletId as WalletCopyContent,
  zh: walletZh as WalletCopyContent,
  ar: walletAr as WalletCopyContent,
};

export const walletCopy: Record<Language, WalletCopyContent> = new Proxy(
  baseWalletCopy as unknown as Record<Language, WalletCopyContent>,
  {
    get: (target, prop: string) => target[prop as keyof typeof target] ?? target.en,
  }
);
