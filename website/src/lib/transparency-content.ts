import type { Language } from "./preferences";

/**
 * Public copy for /transparency ("Team & transparency").
 *
 * Deliberately contains no team names, faces or invented partners: the page is
 * built on facts a visitor can verify (fixed supply, genesis split, onboarding
 * sequence). Only EN and RU are authored; every other locale falls back to EN
 * through the proxy below, the same way the referral surfaces do.
 */
export type TransparencyCopy = {
  meta: { title: string; description: string };
  hero: { eyebrow: string; title: string; lead: string; secondaryCta: string };
  investors: { eyebrow: string; title: string; body: string; points: string[] };
  team: { eyebrow: string; title: string; body: string; points: string[] };
  tokenomics: {
    eyebrow: string;
    title: string;
    lead: string;
    supplyLabel: string;
    supplyValue: string;
    splitTitle: string;
    splitLead: string;
    bucketNote: string;
    vestTitle: string;
    vestBody: string;
    vestSplit: { genesis: string; genesisPct: string; remainder: string; remainderPct: string };
    linkCta: string;
  };
  treasury: { eyebrow: string; title: string; body: string; points: string[] };
  audit: {
    eyebrow: string;
    title: string;
    body: string;
    placeholderTitle: string;
    placeholderBody: string;
  };
  launch: {
    eyebrow: string;
    title: string;
    lead: string;
    steps: { title: string; body: string }[];
  };
  community: {
    eyebrow: string;
    title: string;
    lead: string;
    verified: string;
    countries: string;
    tokens: string;
    nfts: string;
    hidden: string;
  };
  ambassadors: {
    eyebrow: string;
    title: string;
    lead: string;
    empty: string;
    rank: string;
    founder: string;
    wallet: string;
    invites: string;
    ambassadorBadge: string;
  };
  search: {
    eyebrow: string;
    title: string;
    lead: string;
    placeholder: string;
    button: string;
    notFound: string;
    error: string;
    founderLabel: string;
    walletLabel: string;
    countryLabel: string;
    registeredLabel: string;
    privateNote: string;
  };
  report: {
    eyebrow: string;
    title: string;
    lead: string;
    monthLabel: string;
    growthLabel: string;
    countriesLabel: string;
    launchedLabel: string;
    newPeople: string;
    launches: string;
    nothing: string;
    error: string;
  };
};

const en: TransparencyCopy = {
  meta: {
    title: "Team & transparency | PEOPLE Blockchain",
    description:
      "How PEOPLE Blockchain is funded: no venture capital, a small core team, a fixed 1B PPL supply, a 2-of-3 treasury multisig, AI-assisted security reviews (Claude Opus 5.5, GPT Astra, Fable 5.1) and a third-party security audit before mainnet.",
  },
  hero: {
    eyebrow: "TRANSPARENCY",
    title: "Team & transparency",
    lead: "Who is behind People, how the project is funded and what anyone can verify on-chain. No team names and no faces — verifiable facts instead.",
    secondaryCta: "Check the explorer",
  },
  investors: {
    eyebrow: "FUNDING",
    title: "No investors",
    body: "PEOPLE Blockchain has no venture capital and no private investors. Development is self-funded, and there are no early investor allocations: nobody holds tokens for money that was invested before launch.",
    points: [
      "No VC round and no private sale to funds.",
      "Development paid for by the team itself.",
      "No early investor allocation in the genesis split.",
    ],
  },
  team: {
    eyebrow: "TEAM",
    title: "A small core team",
    body: "A small core team works under the project name, not under personal names. That protects the people doing the work, and it keeps the project judged by what it ships rather than by who is on a photo.",
    points: [
      "Team members stay private for their own security.",
      "Trust here does not rest on knowing faces.",
      "Every claim on this page points at data you can check yourself.",
    ],
  },
  tokenomics: {
    eyebrow: "TOKENOMICS",
    title: "Fixed supply, fixed split",
    lead: "Total supply is fixed at one billion PPL. The genesis split into six buckets is the same one published on the tokenomics page:",
    supplyLabel: "Total supply",
    supplyValue: "1,000,000,000 PPL",
    splitTitle: "Genesis split",
    splitLead: "Shares of the fixed one-billion supply at mainnet genesis.",
    bucketNote: "Bucket names are taken from the tokenomics page — no separate numbers are introduced here.",
    vestTitle: "Team vesting",
    vestBody:
      "The team share vests 0% at launch: a 6-month cliff, then 18 months of linear unlocks (24 months in total).",
    vestSplit: {
      genesis: "At launch",
      genesisPct: "0%",
      remainder: "6-month cliff, then linear over 18 months",
      remainderPct: "100%",
    },
    linkCta: "Full tokenomics",
  },
  treasury: {
    eyebrow: "TREASURY",
    title: "Treasury and spending",
    body: "The treasury is a 2-of-3 multisig, created before mainnet; every spend is visible in the explorer.",
    points: [
      "The 2-of-3 multisig is created before mainnet; signer addresses are published then.",
      "Every outgoing treasury transaction is a public explorer entry.",
      "Nothing is moved quietly: treasury spending is readable by anyone.",
    ],
  },
  audit: {
    eyebrow: "AUDIT",
    title: "Security review before mainnet",
    body:
      "Audited by: Claude Opus 5.5, GPT Astra, Fable 5.1. Bug bounty: report a vulnerability from the bug button on any page.",
    placeholderTitle: "Audit report",
    placeholderBody:
      "A third-party security audit report will be published in this slot as soon as it is available. Until then, no external firm audit result is claimed anywhere on this site.",
  },
  launch: {
    eyebrow: "LAUNCH PLAN",
    title: "Million Founders, testnet, mainnet",
    lead: "The order is fixed, and each step opens only after the previous one is done.",
    steps: [
      {
        title: "Public testnet with points",
        body: "The network is open to everyone today. Founders get their number, invite people and earn points for real actions on the testnet.",
      },
      {
        title: "1,000 verified people",
        body: "Mainnet work starts once 1,000 people have been verified on the network.",
      },
      {
        title: "Treasury multisig",
        body: "Before mainnet the treasury is a 2-of-3 multisig, so spending is visible in the explorer.",
      },
      {
        title: "Mainnet and the PPL sale",
        body: "Mainnet and the PPL community sale open after 1,000 verified people and after the multisig is in place.",
      },
    ],
  },
  community: {
    eyebrow: "COMMUNITY",
    title: "Community counters",
    lead: "Live numbers read from the network and the founders database. A counter is hidden while its source is unavailable — nothing on this page is mocked.",
    verified: "Verified people",
    countries: "Countries",
    tokens: "Tokens created",
    nfts: "NFTs created",
    hidden: "Not available right now",
  },
  ambassadors: {
    eyebrow: "AMBASSADORS",
    title: "Top ambassadors",
    lead: "Founders ranked by the number of verified people they invited. Names and avatars appear only for founders who chose to show them.",
    empty: "No verified invites recorded yet — the list appears with the first data.",
    rank: "Rank",
    founder: "Founder",
    wallet: "Wallet",
    invites: "Verified invites",
    ambassadorBadge: "Ambassador",
  },
  search: {
    eyebrow: "FOUNDER LOOKUP",
    title: "Find a founder",
    lead: "Look up a founder by number or by wallet address.",
    placeholder: "Founder number or 0x wallet address",
    button: "Search",
    notFound: "No founder matches that number or wallet address.",
    error: "Lookup is unavailable right now.",
    founderLabel: "Founder number",
    walletLabel: "Wallet",
    countryLabel: "Country",
    registeredLabel: "Registered",
    privateNote: "This founder has not opted in to showing a name or avatar.",
  },
  report: {
    eyebrow: "MONTHLY REPORT",
    title: "Monthly community report",
    lead: "Generated from the network's own data for the month you pick.",
    monthLabel: "Month",
    growthLabel: "Growth",
    countriesLabel: "Top countries",
    launchedLabel: "What launched",
    newPeople: "new verified people",
    launches: "launches recorded",
    nothing: "Nothing recorded for this month yet.",
    error: "The report is unavailable right now.",
  },
};

const ru: TransparencyCopy = {
  meta: {
    title: "Команда и прозрачность | PEOPLE Blockchain",
    description:
      "Как финансируется PEOPLE Blockchain: без венчурного капитала, небольшая команда, фиксированный выпуск 1 млрд PPL, мультисиг казны 2-из-3, AI-проверки (Claude Opus 5.5, GPT Astra, Fable 5.1) и аудит сторонней фирмы до mainnet.",
  },
  hero: {
    eyebrow: "ПРОЗРАЧНОСТЬ",
    title: "Команда и прозрачность",
    lead: "Кто стоит за People, как проект финансируется и что каждый может проверить on-chain. Ни имён команды, ни лиц — только проверяемые факты.",
    secondaryCta: "Проверить в explorer",
  },
  investors: {
    eyebrow: "ФИНАНСИРОВАНИЕ",
    title: "Инвесторов нет",
    body: "У PEOPLE Blockchain нет венчурного капитала и частных инвесторов. Разработка финансируется самостоятельно, и никаких аллокаций ранним инвесторам нет: никто не держит токены за деньги, вложенные до запуска.",
    points: [
      "Ни венчурного раунда, ни частной продажи фондам.",
      "Разработку оплачивает сама команда.",
      "Никаких аллокаций ранним инвесторам в genesis.",
    ],
  },
  team: {
    eyebrow: "КОМАНДА",
    title: "Небольшая основная команда",
    body: "Небольшая команда работает под именем проекта, а не под личными именами. Это защищает людей, которые делают работу, и оставляет проект судить по результату, а не по фотографии.",
    points: [
      "Участники команды остаются приватными ради своей безопасности.",
      "Доверие здесь не держится на знании лиц.",
      "Каждое утверждение на этой странице ведёт к данным, которые можно проверить.",
    ],
  },
  tokenomics: {
    eyebrow: "ТОКЕНОМИКА",
    title: "Фиксированный выпуск и фиксированное деление",
    lead: "Общий выпуск фиксирован: один миллиард PPL. Деление genesis на шесть корзин — то же, что опубликовано на странице токеномики:",
    supplyLabel: "Общий выпуск",
    supplyValue: "1 000 000 000 PPL",
    splitTitle: "Деление genesis",
    splitLead: "Доли фиксированного выпуска в один миллиард при genesis mainnet.",
    bucketNote: "Названия корзин взяты со страницы токеномики — здесь не вводятся отдельные числа.",
    vestTitle: "Vesting команды",
    vestBody:
      "Доля команды разблокируется на 0% при запуске: клифф 6 месяцев, затем линейно 18 месяцев (всего 24 месяца).",
    vestSplit: {
      genesis: "При запуске",
      genesisPct: "0%",
      remainder: "Клифф 6 месяцев, затем линейно 18 месяцев",
      remainderPct: "100%",
    },
    linkCta: "Вся токеномика",
  },
  treasury: {
    eyebrow: "КАЗНА",
    title: "Казна и расходы",
    body: "Казна — мультисиг 2-из-3, создаваемый до mainnet; каждый расход виден в explorer.",
    points: [
      "Мультисиг 2-из-3 создаётся до mainnet; адреса подписантов публикуются тогда же.",
      "Каждая исходящая транзакция казны — публичная запись в explorer.",
      "Тихо ничего не происходит: расходы казны сможет прочитать любой.",
    ],
  },
  audit: {
    eyebrow: "АУДИТ",
    title: "Проверка безопасности до mainnet",
    body:
      "Аудит: Claude Opus 5.5, GPT Astra, Fable 5.1. Баг-баунти: сообщите об уязвимости кнопкой на любой странице.",
    placeholderTitle: "Отчёт об аудите",
    placeholderBody:
      "Отчёт аудита сторонней фирмы будет опубликован на этом месте, как только появится. До этого нигде на сайте не заявлен результат внешнего аудита.",
  },
  launch: {
    eyebrow: "ПЛАН ЗАПУСКА",
    title: "Миллион основателей, testnet, mainnet",
    lead: "Порядок фиксирован, и каждый шаг открывается только после предыдущего.",
    steps: [
      {
        title: "Публичный testnet с баллами",
        body: "Сеть уже открыта для всех. Основатели получают номер, приглашают людей и зарабатывают баллы за реальные действия в тестовой сети.",
      },
      {
        title: "1 000 verified people",
        body: "Работа над mainnet начинается, когда в сети верифицированы 1 000 человек.",
      },
      {
        title: "Мультисиг казны",
        body: "До mainnet казна — мультисиг 2-из-3, чтобы расходы были видны в explorer.",
      },
      {
        title: "Mainnet и продажа PPL",
        body: "Mainnet и продажа PPL сообществу открываются после 1 000 verified people и после запуска мультисига.",
      },
    ],
  },
  community: {
    eyebrow: "СООБЩЕСТВО",
    title: "Счётчики сообщества",
    lead: "Живые числа, прочитанные из сети и базы основателей. Счётчик скрывается, пока его источник недоступен — на этой странице нет заглушек.",
    verified: "Verified people",
    countries: "Стран",
    tokens: "Создано токенов",
    nfts: "Создано NFT",
    hidden: "Сейчас недоступно",
  },
  ambassadors: {
    eyebrow: "АМБАССАДОРЫ",
    title: "Топ амбассадоров",
    lead: "Основатели по числу приглашённых verified people. Имя и аватар показываются только тем, кто сам это включил.",
    empty: "Подтверждённых приглашений пока нет — список появится с первыми данными.",
    rank: "Место",
    founder: "Основатель",
    wallet: "Кошелёк",
    invites: "Приглашено verified",
    ambassadorBadge: "Амбассадор",
  },
  search: {
    eyebrow: "ПОИСК ОСНОВАТЕЛЯ",
    title: "Найти основателя",
    lead: "Найдите основателя по номеру или адресу кошелька.",
    placeholder: "Номер основателя или адрес 0x",
    button: "Найти",
    notFound: "По этому номеру или адресу кошелька основатель не найден.",
    error: "Поиск сейчас недоступен.",
    founderLabel: "Номер основателя",
    walletLabel: "Кошелёк",
    countryLabel: "Страна",
    registeredLabel: "Регистрация",
    privateNote: "Этот основатель не включал показ имени и аватара.",
  },
  report: {
    eyebrow: "МЕСЯЧНЫЙ ОТЧЁТ",
    title: "Месячный отчёт сообщества",
    lead: "Собирается из данных самой сети за выбранный месяц.",
    monthLabel: "Месяц",
    growthLabel: "Рост",
    countriesLabel: "Топ стран",
    launchedLabel: "Что запустилось",
    newPeople: "новых verified people",
    launches: "запусков за месяц",
    nothing: "За этот месяц записей пока нет.",
    error: "Отчёт сейчас недоступен.",
  },
};

const base: Record<string, TransparencyCopy> = { en, ru };

/** Other locales read the English page rather than a half-translated one. */
export const transparencyCopy: Record<Language, TransparencyCopy> = new Proxy(
  base as unknown as Record<Language, TransparencyCopy>,
  {
    get: (target, prop: string) => target[prop as keyof typeof target] ?? target.en,
  }
);
