/**
 * Public site identity — single source of truth for the canonical origin and the
 * brand strings used in metadata, Open Graph, the sitemap and robots.txt.
 *
 * `NEXT_PUBLIC_SITE_URL` overrides the origin for previews/staging and must be an
 * absolute http(s) URL, because Next.js resolves `metadataBase` against it.
 *
 * The default origin is the `www` host on purpose: Vercel serves the site on
 * `www.peopleblockchain.network` and 308-redirects the apex `peopleblockchain.network`
 * to it. Emitting canonical/sitemap/OG URLs on the apex would point every canonical
 * URL at a redirect, so the canonical origin must be the host that actually serves
 * the content. Change this only together with Vercel's primary-domain setting.
 *
 * Naming follows docs/TERMINOLOGY.md: brand "People", network name localized per locale,
 * native token "People" (ticker PPL). The PEOPLE wordmark is never translated.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.peopleblockchain.network";

/** Public brand wordmark — never translated. */
export const SITE_NAME = "PEOPLE";

import type { Language } from "./preferences";

/** Official localized network name ("blockchain for the community") per public locale. */
export const NETWORK_NAME_BY_LANG: Record<Language, string> = {
  en: "PEOPLE Blockchain",
  ru: "Блокчейн для сообщества",
  de: "Blockchain für die Gemeinschaft",
  es: "Blockchain para la comunidad",
  fr: "Blockchain pour la communauté",
  it: "Blockchain per la comunità",
  pt: "Blockchain para a comunidade",
  tr: "Topluluk için blokzincir",
  vi: "Blockchain dành cho cộng đồng",
  zh: "社区区块链",
  id: "Blockchain untuk komunitas",
  ar: "بلوك تشين للمجتمع",
};

/** International network name (EN). */
export const NETWORK_NAME_EN = NETWORK_NAME_BY_LANG.en;

/** Header/footer brand subtitle — never translated (official product name). */
export const BRAND_TAGLINE = NETWORK_NAME_EN;

/** @deprecated Use NETWORK_NAME_BY_LANG.ru */
export const NETWORK_NAME_RU = NETWORK_NAME_BY_LANG.ru;

const homeTitle = (network: string) => `PEOPLE — ${network}`;

/** Document title used by the root layout (default / crawler locale is EN). */
export const SITE_TITLE = homeTitle(NETWORK_NAME_EN);

/** Meta description used by the root layout. */
export const SITE_DESCRIPTION =
  "PEOPLE — the blockchain for communities. Launch a token for your community: 10% of its supply goes to your people, not to whales. Public testnet, fees in PPL.";

/** Open Graph / Twitter title shared by routes that do not override it. */
export const SITE_OG_TITLE = SITE_TITLE;

/** Open Graph / Twitter description shared by routes that do not override it. */
export const SITE_OG_DESCRIPTION =
  "Launch a token for your community on PEOPLE. 10% of every new token goes to the community pool, not to whales.";

/** Russian locale metadata equivalents — localized title leads. */
export const SITE_TITLE_RU = homeTitle(NETWORK_NAME_BY_LANG.ru);
export const SITE_DESCRIPTION_RU =
  "PEOPLE — блокчейн для сообществ. Запустите токен для своего сообщества: 10% выпуска получают ваши люди, а не киты. Публичная тестовая сеть, комиссии в PPL.";
export const SITE_OG_TITLE_RU = SITE_TITLE_RU;
export const SITE_OG_DESCRIPTION_RU =
  "Запустите токен для своего сообщества в PEOPLE. 10% каждого нового токена идёт в пул сообщества, а не китам.";

export type DocumentTitlesLocale = {
  home: string;
  howItWorks: string;
  create: string;
  createToken: string;
  createNft: string;
  createContract: string;
  docs: string;
  fees: string;
  tokenomics: string;
  wallet: string;
  explorer: string;
  swap: string;
  founders: string;
  transparency: string;
  litepaper: string;
  privacy: string;
  terms: string;
};

function titlesForLang(lang: Language): DocumentTitlesLocale {
  const net = NETWORK_NAME_BY_LANG[lang];
  const suffix = (page: string) => `${page} | ${net}`;
  const privacyTerms =
    lang === "en"
      ? { privacy: suffix("Privacy Policy"), terms: suffix("Terms of Service") }
      : { privacy: suffix("Privacy Policy"), terms: suffix("Terms of Service") };

  const byLang: Partial<Record<Language, Record<string, string>>> = {
    en: {
      home: SITE_TITLE,
      howItWorks: suffix("How It Works"),
      create: suffix("Create"),
      createToken: suffix("Create a token"),
      createNft: suffix("Create an NFT"),
      createContract: suffix("Create a contract"),
      docs: suffix("Documentation"),
      fees: suffix("Fees & pricing"),
      tokenomics: suffix("Tokenomics"),
      wallet: suffix("Wallet"),
      explorer: suffix("Explorer"),
      swap: suffix("Swap"),
      founders: suffix("Million founders"),
      transparency: suffix("Team & transparency"),
      litepaper: suffix("Litepaper"),
      ...privacyTerms,
    },
    ru: {
      home: SITE_TITLE_RU,
      howItWorks: suffix("Как это работает"),
      create: suffix("Создать"),
      createToken: suffix("Создать токен"),
      createNft: suffix("Создать NFT"),
      createContract: suffix("Создать контракт"),
      docs: suffix("Документация"),
      fees: suffix("Комиссии и тарифы"),
      tokenomics: suffix("Токеномика"),
      wallet: suffix("Кошелёк"),
      explorer: suffix("Сканер"),
      swap: suffix("Обмен"),
      founders: suffix("Миллион основателей"),
      transparency: suffix("Команда и прозрачность"),
      litepaper: suffix("Litepaper"),
      ...privacyTerms,
    },
    es: {
      home: homeTitle(net),
      howItWorks: suffix("Cómo funciona"),
      create: suffix("Crear"),
      createToken: suffix("Crear un token"),
      createNft: suffix("Crear un NFT"),
      createContract: suffix("Crear un contrato"),
      docs: suffix("Documentación"),
      fees: suffix("Comisiones y tarifas"),
      tokenomics: suffix("Tokenomía"),
      wallet: suffix("Cartera"),
      explorer: suffix("Explorador"),
      swap: suffix("Intercambio"),
      founders: suffix("Un millón de fundadores"),
      transparency: suffix("Equipo y transparencia"),
      litepaper: suffix("Litepaper"),
      ...privacyTerms,
    },
    pt: {
      home: homeTitle(net),
      howItWorks: suffix("Como funciona"),
      create: suffix("Criar"),
      createToken: suffix("Criar um token"),
      createNft: suffix("Criar um NFT"),
      createContract: suffix("Criar um contrato"),
      docs: suffix("Documentação"),
      fees: suffix("Taxas e preços"),
      tokenomics: suffix("Tokenomia"),
      wallet: suffix("Carteira"),
      explorer: suffix("Explorador"),
      swap: suffix("Troca"),
      founders: suffix("Um milhão de fundadores"),
      transparency: suffix("Equipe e transparência"),
      litepaper: suffix("Litepaper"),
      ...privacyTerms,
    },
    fr: {
      home: homeTitle(net),
      howItWorks: suffix("Comment ça marche"),
      create: suffix("Créer"),
      createToken: suffix("Créer un jeton"),
      createNft: suffix("Créer un NFT"),
      createContract: suffix("Créer un contrat"),
      docs: suffix("Documentation"),
      fees: suffix("Frais et tarifs"),
      tokenomics: suffix("Tokenomique"),
      wallet: suffix("Portefeuille"),
      explorer: suffix("Explorateur"),
      swap: suffix("Échange"),
      founders: suffix("Un million de fondateurs"),
      transparency: suffix("Équipe et transparence"),
      litepaper: suffix("Litepaper"),
      ...privacyTerms,
    },
    de: {
      home: homeTitle(net),
      howItWorks: suffix("So funktioniert es"),
      create: suffix("Erstellen"),
      createToken: suffix("Token erstellen"),
      createNft: suffix("NFT erstellen"),
      createContract: suffix("Vertrag erstellen"),
      docs: suffix("Dokumentation"),
      fees: suffix("Gebühren und Preise"),
      tokenomics: suffix("Tokenomik"),
      wallet: suffix("Wallet"),
      explorer: suffix("Explorer"),
      swap: suffix("Tausch"),
      founders: suffix("Eine Million Gründer"),
      transparency: suffix("Team und Transparenz"),
      litepaper: suffix("Litepaper"),
      ...privacyTerms,
    },
    it: {
      home: homeTitle(net),
      howItWorks: suffix("Come funziona"),
      create: suffix("Crea"),
      createToken: suffix("Crea un token"),
      createNft: suffix("Crea un NFT"),
      createContract: suffix("Crea un contratto"),
      docs: suffix("Documentazione"),
      fees: suffix("Commissioni e tariffe"),
      tokenomics: suffix("Tokenomics"),
      wallet: suffix("Portafoglio"),
      explorer: suffix("Explorer"),
      swap: suffix("Scambio"),
      founders: suffix("Un milione di fondatori"),
      transparency: suffix("Team e trasparenza"),
      litepaper: suffix("Litepaper"),
      ...privacyTerms,
    },
    tr: {
      home: homeTitle(net),
      howItWorks: suffix("Nasıl çalışır"),
      create: suffix("Oluştur"),
      createToken: suffix("Token oluştur"),
      createNft: suffix("NFT oluştur"),
      createContract: suffix("Sözleşme oluştur"),
      docs: suffix("Belgeler"),
      fees: suffix("Ücretler ve tarifeler"),
      tokenomics: suffix("Tokenomik"),
      wallet: suffix("Cüzdan"),
      explorer: suffix("Kaşif"),
      swap: suffix("Takas"),
      founders: suffix("Bir milyon kurucu"),
      transparency: suffix("Ekip ve şeffaflık"),
      litepaper: suffix("Litepaper"),
      ...privacyTerms,
    },
    vi: {
      home: homeTitle(net),
      howItWorks: suffix("Cách hoạt động"),
      create: suffix("Tạo"),
      createToken: suffix("Tạo token"),
      createNft: suffix("Tạo NFT"),
      createContract: suffix("Tạo hợp đồng"),
      docs: suffix("Tài liệu"),
      fees: suffix("Phí và biểu giá"),
      tokenomics: suffix("Tokenomics"),
      wallet: suffix("Ví"),
      explorer: suffix("Trình khám phá"),
      swap: suffix("Đổi"),
      founders: suffix("Một triệu nhà sáng lập"),
      transparency: suffix("Đội ngũ và minh bạch"),
      litepaper: suffix("Litepaper"),
      ...privacyTerms,
    },
    id: {
      home: homeTitle(net),
      howItWorks: suffix("Cara kerjanya"),
      create: suffix("Buat"),
      createToken: suffix("Buat token"),
      createNft: suffix("Buat NFT"),
      createContract: suffix("Buat kontrak"),
      docs: suffix("Dokumentasi"),
      fees: suffix("Biaya dan tarif"),
      tokenomics: suffix("Tokenomi"),
      wallet: suffix("Dompet"),
      explorer: suffix("Penjelajah"),
      swap: suffix("Tukar"),
      founders: suffix("Sejuta pendiri"),
      transparency: suffix("Tim dan transparansi"),
      litepaper: suffix("Litepaper"),
      ...privacyTerms,
    },
    zh: {
      home: homeTitle(net),
      howItWorks: suffix("如何运作"),
      create: suffix("创建"),
      createToken: suffix("创建代币"),
      createNft: suffix("创建 NFT"),
      createContract: suffix("创建合约"),
      docs: suffix("文档"),
      fees: suffix("手续费与定价"),
      tokenomics: suffix("代币经济"),
      wallet: suffix("钱包"),
      explorer: suffix("浏览器"),
      swap: suffix("兑换"),
      founders: suffix("百万创始人"),
      transparency: suffix("团队与透明度"),
      litepaper: suffix("Litepaper"),
      ...privacyTerms,
    },
    ar: {
      home: homeTitle(net),
      howItWorks: suffix("كيف يعمل"),
      create: suffix("إنشاء"),
      createToken: suffix("إنشاء رمز"),
      createNft: suffix("إنشاء NFT"),
      createContract: suffix("إنشاء عقد"),
      docs: suffix("التوثيق"),
      fees: suffix("الرسوم والأسعار"),
      tokenomics: suffix("اقتصاد التوكن"),
      wallet: suffix("المحفظة"),
      explorer: suffix("المستكشف"),
      swap: suffix("مبادلة"),
      founders: suffix("مليون مؤسس"),
      transparency: suffix("الفريق والشفافية"),
      litepaper: suffix("Litepaper"),
      ...privacyTerms,
    },
  };

  return byLang[lang] as DocumentTitlesLocale;
}

/** Browser tab titles after the visitor chooses a locale (client-side). */
const rawDocumentTitles = {
  en: titlesForLang("en"),
  ru: titlesForLang("ru"),
  es: titlesForLang("es"),
  pt: titlesForLang("pt"),
  fr: titlesForLang("fr"),
  de: titlesForLang("de"),
  it: titlesForLang("it"),
  tr: titlesForLang("tr"),
  vi: titlesForLang("vi"),
  id: titlesForLang("id"),
  zh: titlesForLang("zh"),
  ar: titlesForLang("ar"),
} as const;

export const DOCUMENT_TITLES: Record<Language, DocumentTitlesLocale> = new Proxy(
  rawDocumentTitles as unknown as Record<Language, DocumentTitlesLocale>,
  {
    get: (target, prop: string) => (target as Record<string, DocumentTitlesLocale>)[prop] ?? target.en,
  }
);

/** The public routes of this app, in canonical form. */
export const SITE_ROUTES = [
  { path: "/", changeFrequency: "monthly" as const, priority: 1 },
  { path: "/how-it-works", changeFrequency: "monthly" as const, priority: 0.8 },
  { path: "/create", changeFrequency: "weekly" as const, priority: 0.9 },
  { path: "/create/token", changeFrequency: "weekly" as const, priority: 0.85 },
  { path: "/create/nft", changeFrequency: "weekly" as const, priority: 0.85 },
  { path: "/create/contract", changeFrequency: "weekly" as const, priority: 0.85 },
  { path: "/docs", changeFrequency: "monthly" as const, priority: 0.8 },
  { path: "/tokenomics", changeFrequency: "monthly" as const, priority: 0.78 },
  { path: "/fees", changeFrequency: "monthly" as const, priority: 0.75 },
  { path: "/wallet", changeFrequency: "weekly" as const, priority: 0.9 },
  { path: "/explorer", changeFrequency: "weekly" as const, priority: 0.9 },
  { path: "/swap", changeFrequency: "weekly" as const, priority: 0.85 },
  { path: "/founders", changeFrequency: "weekly" as const, priority: 0.88 },
  { path: "/litepaper", changeFrequency: "monthly" as const, priority: 0.8 },
  { path: "/transparency", changeFrequency: "monthly" as const, priority: 0.7 },
  { path: "/privacy", changeFrequency: "yearly" as const, priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly" as const, priority: 0.3 },
];
