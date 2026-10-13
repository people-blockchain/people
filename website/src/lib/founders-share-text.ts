import type { Language } from "./preferences";

/**
 * Founder share messages, one per shipped locale. The sharer's current site locale picks the text;
 * the shared link carries no locale, so the recipient's own browser language is detected on arrival.
 * `{{n}}` is the founder number.
 */
const SHARE_MINE: Record<Language, string> = {
  en: "I am Founder #{{n}} of People's Blockchain. Get your Founder Number:",
  ru: "Я основатель №{{n}} в People's Blockchain. Получи свой номер основателя:",
  es: "Soy el Fundador n.º {{n}} de People's Blockchain. Consigue tu número de fundador:",
  pt: "Sou o Fundador nº {{n}} da People's Blockchain. Pegue o seu número de fundador:",
  fr: "Je suis le Fondateur n° {{n}} de People's Blockchain. Obtiens ton numéro de fondateur :",
  de: "Ich bin Gründer Nr. {{n}} von People's Blockchain. Hol dir deine Gründernummer:",
  it: "Sono il Fondatore n. {{n}} di People's Blockchain. Ottieni il tuo numero di fondatore:",
  tr: "People's Blockchain'in {{n}} numaralı kurucusuyum. Kurucu numaranı al:",
  vi: "Tôi là Nhà sáng lập số {{n}} của People's Blockchain. Nhận số nhà sáng lập của bạn:",
  id: "Saya Pendiri #{{n}} People's Blockchain. Dapatkan nomor pendiri Anda:",
  zh: "我是 People's Blockchain 的第 {{n}} 号创始人。领取你的创始人编号：",
  ar: "أنا المؤسس رقم {{n}} في People's Blockchain. احصل على رقم المؤسس الخاص بك:",
};

const SHARE_JOIN: Record<Language, string> = {
  en: "I'm joining the Million Founders on People's Blockchain — a blockchain for everyone, no code needed.",
  ru: "Я вступаю в «Миллион основателей» People's Blockchain — блокчейн для всех, без кода.",
  es: "Me uno a Un millón de fundadores en People's Blockchain: una blockchain para todos, sin código.",
  pt: "Estou entrando nos Um milhão de fundadores da People's Blockchain: uma blockchain para todos, sem código.",
  fr: "Je rejoins Un million de fondateurs sur People's Blockchain : une blockchain pour tous, sans code.",
  de: "Ich werde einer von einer Million Gründern bei People's Blockchain – eine Blockchain für alle, ohne Code.",
  it: "Mi unisco a Un milione di fondatori su People's Blockchain: una blockchain per tutti, senza codice.",
  tr: "People's Blockchain'de Bir Milyon Kurucu'ya katılıyorum: herkes için, kod gerektirmeyen bir blokzincir.",
  vi: "Tôi tham gia Một triệu nhà sáng lập trên People's Blockchain — blockchain cho mọi người, không cần code.",
  id: "Saya bergabung dengan Sejuta Pendiri di People's Blockchain — blockchain untuk semua, tanpa kode.",
  zh: "我正加入 People's Blockchain 的“百万创始人”——人人可用、无需代码的区块链。",
  ar: "أنضم إلى مليون مؤسس في People's Blockchain — بلوك تشين للجميع بلا حاجة إلى كتابة كود.",
};

export function founderShareText(lang: string, founderNumber: number | null): string {
  const join = (SHARE_JOIN as Record<string, string>)[lang] ?? SHARE_JOIN.en;
  if (founderNumber == null) return join;
  const mine = (SHARE_MINE as Record<string, string>)[lang] ?? SHARE_MINE.en;
  return mine.replace("{{n}}", founderNumber.toLocaleString(lang));
}

/** Share URL is locale-free on purpose: the recipient's browser language decides their locale. */
export function founderShareUrl(origin: string, referralWallet: string | null): string {
  if (!origin) return "";
  return referralWallet ? `${origin}/founders?ref=${referralWallet}` : `${origin}/founders`;
}

export const FOUNDER_SHARE_LANGS = Object.keys(SHARE_MINE) as Language[];
