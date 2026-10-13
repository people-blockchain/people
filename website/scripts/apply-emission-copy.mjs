#!/usr/bin/env node
/**
 * One-off patch: PPL emission copy for tokenomics surfaces + hiw + roadmap locales.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const surfaces = join(dirname(fileURLToPath(import.meta.url)), "../src/lib/locales/surfaces");

const tokenomics = {
  es: {
    supplyBody:
      "Oferta total fija: 1.000.000.000 PPL (mil millones). Años 1–4: 0% de inflación — sin monedas nuevas más allá de los desbloqueos programados. Desde el año 5, emisión adicional máx. 2% anual solo por voto de gobernanza.",
    bucketNotes: {
      community:
        "35% genesis — fundadores, recompensas, embajadores y airdrops solo desde este fondo (6 años).",
      validators:
        "200M PPL (20%): años 1–4 pagan 6%, 5%, 5%, 4% del supply total al año (60M / 50M / 50M / 40M PPL) más 30% de las comisiones de red.",
    },
    saleLead:
      "Hasta 100M PPL del tramo de venta están reservados para una curva de precios pública tras el airdrop de fundadores. La venta permanece cerrada hasta que exista una entidad operadora de la venta.",
    emissionTitle: "Emisión y recompensas a validadores",
    emissionLead:
      "La seguridad se paga desde el pool de validadores y las comisiones — sin acuñar supply nuevo en los años 1–4.",
    emissionBullets: [
      "Años 1–4: 0% de inflación — el tope de un mil millones no aumenta.",
      "Pool de validadores: 200M PPL con calendario 6% / 5% / 5% / 4% del supply total (60M, 50M, 50M, 40M PPL en años 1–4) más 30% de cada comisión de protocolo.",
      "Fundadores, recompensas, embajadores y airdrops solo desde el fondo comunitario del 35%.",
      "Desde el año 5, emisión nueva máx. 2% anual y solo por voto comunitario.",
    ],
    launchOrderTitle: "Orden de lanzamiento",
    launchOrderBody:
      "Primero el airdrop de fundadores. La venta comunitaria de PPL solo después de 1.000 personas verificadas y un multisig publicado.",
    feeTitle: "Reparto de comisiones de red",
    feeLead: "Cada comisión de protocolo en People sigue Model A aprobada:",
  },
  pt: {
    supplyBody:
      "Oferta fixa de 1.000.000.000 PPL (um bilhão). Anos 1–4: 0% de inflação — sem moedas novas além dos desbloqueios. A partir do ano 5, emissão extra de no máximo 2% ao ano só por voto da comunidade.",
    bucketNotes: {
      community:
        "35% genesis — fundadores, recompensas, embaixadores e airdrops apenas deste fundo (6 anos).",
      validators:
        "200M PPL (20%): anos 1–4 pagam 6%, 5%, 5%, 4% do supply total por ano (60M / 50M / 50M / 40M PPL) mais 30% das taxas de rede.",
    },
    saleLead:
      "Até 100M PPL do lote de venda estão reservados para uma curva de preços pública após o airdrop dos fundadores. A venda permanece fechada até existir uma entidade operadora da venda.",
    emissionTitle: "Emissão e recompensas de validadores",
    emissionLead:
      "Segurança paga pelo pool de validadores e taxas — sem cunhar supply novo nos anos 1–4.",
    emissionBullets: [
      "Anos 1–4: 0% de inflação — o teto de um bilhão não aumenta.",
      "Pool de validadores: 200M PPL em calendário 6% / 5% / 5% / 4% do supply (60M, 50M, 50M, 40M PPL nos anos 1–4) mais 30% de cada taxa de protocolo.",
      "Fundadores, recompensas, embaixadores e airdrops só do fundo comunitário de 35%.",
      "A partir do ano 5, emissão nova de no máximo 2% ao ano e só por voto comunitário.",
    ],
    launchOrderTitle: "Sequência de lançamento",
    launchOrderBody:
      "Primeiro o airdrop de fundadores. A venda comunitária de PPL só após 1.000 pessoas verificadas e multisig publicado.",
    feeTitle: "Divisão das taxas de rede",
    feeLead: "Cada taxa de protocolo em People segue a Model A aprovada:",
  },
  fr: {
    supplyBody:
      "Offre fixe de 1 000 000 000 PPL (un milliard). Années 1–4 : 0 % d’inflation — pas de nouvelles pièces hors déblocages prévus. À partir de l’année 5, émission supplémentaire plafonnée à 2 % par an et uniquement par vote.",
    bucketNotes: {
      community:
        "35 % genesis — fondateurs, primes, ambassadeurs et airdrops uniquement depuis ce fonds (6 ans).",
      validators:
        "200M PPL (20 %) : années 1–4 versent 6 %, 5 %, 5 %, 4 % du supply total par an (60M / 50M / 50M / 40M PPL) plus 30 % des frais réseau.",
    },
    saleLead:
      "Jusqu'à 100M PPL du lot de vente sont réservés à une courbe de prix publique après l'airdrop des fondateurs. La vente reste fermée tant qu'une entité opératrice de la vente n'existe pas.",
    emissionTitle: "Émission et récompenses validateurs",
    emissionLead:
      "La sécurité est financée par le pool validateurs et les frais — pas de frappe nouvelle les années 1–4.",
    emissionBullets: [
      "Années 1–4 : 0 % d’inflation — le plafond d’un milliard ne bouge pas.",
      "Pool validateurs : 200M PPL selon 6 % / 5 % / 5 % / 4 % du supply (60M, 50M, 50M, 40M PPL en années 1–4) plus 30 % de chaque frais de protocole.",
      "Fondateurs, primes, ambassadeurs et airdrops uniquement depuis le fonds communautaire 35 %.",
      "À partir de l’année 5, émission nouvelle max. 2 % par an et seulement par vote communautaire.",
    ],
    launchOrderTitle: "Ordre de lancement",
    launchOrderBody:
      "D’abord l’airdrop fondateurs. La vente PPL communautaire seulement après 1 000 personnes vérifiées et un multisig publié.",
    feeTitle: "Répartition des frais réseau",
    feeLead: "Chaque frais de protocole sur People suit la Model A approuvée :",
  },
  de: {
    supplyBody:
      "Festes Angebot: 1.000.000.000 PPL (eine Milliarde). Jahre 1–4: 0 % Inflation — keine neuen Coins außerhalb der Freigabepläne. Ab Jahr 5 höchstens 2 % Emission pro Jahr nur per Community-Vote.",
    bucketNotes: {
      community:
        "35 % Genesis — Gründer, Prämien, Botschafter und Airdrops nur aus diesem Topf (6 Jahre).",
      validators:
        "200M PPL (20 %): Jahre 1–4 zahlen 6 %, 5 %, 5 %, 4 % des Gesamtangebots pro Jahr (60M / 50M / 50M / 40M PPL) plus 30 % der Netzwerkgebühren.",
    },
    saleLead:
      "Bis zu 100M PPL aus dem Verkaufsbudget sind für eine öffentliche Bonding-Kurve nach dem Gründer-Airdrop reserviert. Der Verkauf bleibt geschlossen, bis eine Betreibergesellschaft für den Verkauf existiert.",
    emissionTitle: "Emission und Validator-Belohnungen",
    emissionLead:
      "Sicherheit wird aus dem Validator-Pool und Gebühren bezahlt — in Jahren 1–4 kein neues Minting.",
    emissionBullets: [
      "Jahre 1–4: 0 % Inflation — die Milliarden-Obergrenze steigt nicht.",
      "Validator-Pool: 200M PPL nach 6 % / 5 % / 5 % / 4 % des Gesamtangebots (60M, 50M, 50M, 40M PPL in Jahren 1–4) plus 30 % jeder Protokollgebühr.",
      "Gründer, Prämien, Botschafter und Airdrops nur aus dem 35 %-Community-Topf.",
      "Ab Jahr 5 höchstens 2 % neue Emission pro Jahr und nur per Governance-Vote.",
    ],
    launchOrderTitle: "Startreihenfolge",
    launchOrderBody:
      "Zuerst Gründer-Airdrop. Der öffentliche PPL-Verkauf erst nach 1.000 verifizierten Personen und veröffentlichtem Multisig.",
    feeTitle: "Aufteilung der Netzwerkgebühren",
    feeLead: "Jede Protokollgebühr auf People folgt der genehmigten Model A:",
  },
  it: {
    supplyBody:
      "Offerta fissa di 1.000.000.000 PPL (un miliardo). Anni 1–4: 0% di inflazione — nessuna nuova moneta oltre gli sblocchi previsti. Dal quinto anno emissione aggiuntiva max 2% annuo solo per voto della community.",
    bucketNotes: {
      community:
        "35% genesis — fondatori, bounty, ambasciatori e airdrop solo da questo fondo (6 anni).",
      validators:
        "200M PPL (20%): anni 1–4 pagano 6%, 5%, 5%, 4% del supply totale all’anno (60M / 50M / 50M / 40M PPL) più 30% delle commissioni di rete.",
    },
    saleLead:
      "Fino a 100M PPL del lotto di vendita sono riservati a una curva di prezzo pubblica dopo l'airdrop dei fondatori. La vendita resta chiusa finché non esiste un soggetto giuridico che la gestisca.",
    emissionTitle: "Emissione e ricompense validatori",
    emissionLead:
      "La sicurezza è pagata dal pool validatori e dalle commissioni — niente nuovo mint negli anni 1–4.",
    emissionBullets: [
      "Anni 1–4: 0% di inflazione — il tetto di un miliardo non aumenta.",
      "Pool validatori: 200M PPL su calendario 6% / 5% / 5% / 4% del supply (60M, 50M, 50M, 40M PPL negli anni 1–4) più 30% di ogni commissione di protocollo.",
      "Fondatori, bounty, ambasciatori e airdrop solo dal fondo community al 35%.",
      "Dal quinto anno emissione nuova max 2% annuo e solo per voto comunitario.",
    ],
    launchOrderTitle: "Sequenza di lancio",
    launchOrderBody:
      "Prima l’airdrop fondatori. La vendita PPL community solo dopo 1.000 persone verificate e multisig pubblicato.",
    feeTitle: "Suddivisione commissioni di rete",
    feeLead: "Ogni commissione di protocollo su People segue la Model A approvata:",
  },
  tr: {
    supplyBody:
      "Sabit arz: 1.000.000.000 PPL (bir milyar). Yıl 1–4: %0 enflasyon — planlı açılımlar dışında yeni coin yok. 5. yıldan itibaren ek emisyon yılda en fazla %2 ve yalnızca topluluk oyuyla.",
    bucketNotes: {
      community:
        "Genesis %35 — kurucular, ödüller, elçiler ve airdrop yalnızca bu havuzdan (6 yıl).",
      validators:
        "200M PPL (%20): yıl 1–4 toplam arzın yıllık %6, %5, %5, %4 (60M / 50M / 50M / 40M PPL) artı ağ ücretlerinin %30’u.",
    },
    saleLead:
      "Satış havuzundaki 100M PPL'ye kadar kısım, kurucu airdrop'undan sonra halka açık bir fiyat eğrisi (bonding curve) için ayrılmıştır. Satış, onu işletecek bir tüzel kişilik oluşana kadar kapalı kalır.",
    emissionTitle: "Emisyon ve doğrulayıcı ödülleri",
    emissionLead:
      "Güvenlik doğrulayıcı havuzu ve ücretlerle ödenir — yıl 1–4’te yeni basım yok.",
    emissionBullets: [
      "Yıl 1–4: %0 enflasyon — bir milyar tavanı artmaz.",
      "Doğrulayıcı havuzu: 200M PPL, toplam arzın %6 / %5 / %5 / %4 takvimi (yıl 1–4’te 60M, 50M, 50M, 40M PPL) artı her protokol ücretinin %30’u.",
      "Kurucu, ödül, elçi ve airdrop yalnızca %35 topluluk havuzundan.",
      "5. yıldan itibaren yeni emisyon yılda en fazla %2 ve yalnızca topluluk oyuyla.",
    ],
    launchOrderTitle: "Lansman sırası",
    launchOrderBody:
      "Önce kurucu airdrop. Topluluk PPL satışı yalnızca 1.000 doğrulanmış kişi ve yayınlanmış multisig sonrası.",
    feeTitle: "Ağ ücreti dağılımı",
    feeLead: "People’daki her protokol ücreti onaylı Model A’yı izler:",
  },
  vi: {
    supplyBody:
      "Tổng cung cố định 1.000.000.000 PPL (một tỷ). Năm 1–4: 0% lạm phát — không đúc thêm ngoài lịch mở khóa. Từ năm 5, phát hành thêm tối đa 2%/năm và chỉ khi cộng đồng bỏ phiếu.",
    bucketNotes: {
      community:
        "35% genesis — nhà sáng lập, thưởng, đại sứ và airdrop chỉ từ quỹ này (6 năm).",
      validators:
        "200M PPL (20%): năm 1–4 trả 6%, 5%, 5%, 4% tổng cung mỗi năm (60M / 50M / 50M / 40M PPL) cộng 30% phí mạng.",
    },
    saleLead:
      "Tối đa 100M PPL từ phần bán được dành cho đường cong giá công khai (bonding curve) sau airdrop cho nhà sáng lập. Đợt bán vẫn đóng cho đến khi có pháp nhân vận hành đợt bán.",
    emissionTitle: "Phát hành và thưởng validator",
    emissionLead:
      "An ninh trả từ quỹ validator và phí — không đúc mới trong năm 1–4.",
    emissionBullets: [
      "Năm 1–4: 0% lạm phát — trần một tỷ không tăng.",
      "Quỹ validator: 200M PPL theo lịch 6% / 5% / 5% / 4% tổng cung (60M, 50M, 50M, 40M PPL trong năm 1–4) cộng 30% mỗi phí giao thức.",
      "Nhà sáng lập, thưởng, đại sứ và airdrop chỉ từ quỹ cộng đồng 35%.",
      "Từ năm 5, phát hành mới tối đa 2%/năm và chỉ khi cộng đồng bỏ phiếu.",
    ],
    launchOrderTitle: "Thứ tự ra mắt",
    launchOrderBody:
      "Airdrop nhà sáng lập trước. Bán PPL cộng đồng chỉ sau 1.000 người xác minh và multisig công bố.",
    feeTitle: "Phân chia phí mạng",
    feeLead: "Mỗi phí giao thức trên People theo Model A đã duyệt:",
  },
  id: {
    supplyBody:
      "Pasokan tetap 1.000.000.000 PPL (satu miliar). Tahun 1–4: inflasi 0% — tidak ada koin baru di luar jadwal buka. Dari tahun 5, emisi tambahan maks. 2% per tahun hanya lewat voting komunitas.",
    bucketNotes: {
      community:
        "35% genesis — pendiri, hadiah, duta dan airdrop hanya dari kolam ini (6 tahun).",
      validators:
        "200M PPL (20%): tahun 1–4 membayar 6%, 5%, 5%, 4% dari total pasokan per tahun (60M / 50M / 50M / 40M PPL) plus 30% biaya jaringan.",
    },
    saleLead:
      "Hingga 100M PPL dari bagian penjualan disisihkan untuk kurva harga publik (bonding curve) setelah airdrop pendiri. Penjualan tetap tertutup sampai ada badan hukum yang mengoperasikannya.",
    emissionTitle: "Emisi dan hadiah validator",
    emissionLead:
      "Keamanan dibayar dari kolam validator dan biaya — tanpa mint baru di tahun 1–4.",
    emissionBullets: [
      "Tahun 1–4: inflasi 0% — batas satu miliar tidak naik.",
      "Kolam validator: 200M PPL jadwal 6% / 5% / 5% / 4% pasokan (60M, 50M, 50M, 40M PPL di tahun 1–4) plus 30% setiap biaya protokol.",
      "Pendiri, hadiah, duta dan airdrop hanya dari kolam komunitas 35%.",
      "Dari tahun 5, emisi baru maks. 2% per tahun dan hanya lewat voting komunitas.",
    ],
    launchOrderTitle: "Urutan peluncuran",
    launchOrderBody:
      "Airdrop pendiri dulu. Penjualan PPL komunitas hanya setelah 1.000 orang terverifikasi dan multisig dipublikasikan.",
    feeTitle: "Pembagian biaya jaringan",
    feeLead: "Setiap biaya protokol di People mengikuti Model A yang disetujui:",
  },
  zh: {
    supplyBody:
      "总供应固定为 1,000,000,000 PPL（十亿）。第 1–4 年：0% 通胀——除计划解锁外不增发。第 5 年起额外发行每年最多 2%，且须社区治理投票。",
    bucketNotes: {
      community: "35% 创世池——创始人、赏金、大使与空投仅从此池支出（6 年释放）。",
      validators:
        "200M PPL（20%）：第 1–4 年每年支付总供应的 6%、5%、5%、4%（60M / 50M / 50M / 40M PPL），另加网络手续费的 30%。",
    },
    saleLead:
      "销售池中最多 100M PPL 预留给创始空投后的公开联合曲线（bonding curve）。在销售运营主体成立之前，销售保持关闭。",
    emissionTitle: "发行与验证者奖励",
    emissionLead: "安全支出来自验证者池与手续费——第 1–4 年不增发新币。",
    emissionBullets: [
      "第 1–4 年：0% 通胀——十亿上限不提高。",
      "验证者池：200M PPL，按总供应 6% / 5% / 5% / 4% 解锁（第 1–4 年 60M、50M、50M、40M PPL），另加每笔协议手续费的 30%。",
      "创始人、赏金、大使与空投仅来自 35% 社区与奖励池。",
      "第 5 年起，新发行每年最多 2%，且须社区治理投票。",
    ],
    launchOrderTitle: "启动顺序",
    launchOrderBody: "先进行创始人空投。社区 PPL 销售仅在 1,000 名已验证用户与公开多签之后开放。",
    feeTitle: "网络手续费分配",
    feeLead: "People 上每笔协议手续费遵循已批准的 Model A：",
  },
  ar: {
    supplyBody:
      "العرض ثابت: 1,000,000,000 PPL (مليار). السنوات 1–4: تضخم 0% — لا عملات جديدة خارج جداول الفتح. من السنة 5 إصدار إضافي بحد أقصى 2% سنويًا وبموافقة المجتمع فقط.",
    bucketNotes: {
      community:
        "35% genesis — المؤسسون والمكافآت والسفراء والإيردروب من هذا الصندوق فقط (6 سنوات).",
      validators:
        "200M PPL (20%): السنوات 1–4 تدفع 6% و5% و5% و4% من العرض الكلي سنويًا (60M / 50M / 50M / 40M PPL) زائد 30% من رسوم الشبكة.",
    },
    saleLead:
      "حتى 100M PPL من حصة البيع مخصصة لمنحنى تسعير عام (bonding curve) بعد إيردروب المؤسسين. يبقى البيع مغلقاً حتى يوجد كيان قانوني مشغّل للبيع.",
    emissionTitle: "الإصدار ومكافآت المدققين",
    emissionLead: "الأمان يُموَّل من صندوق المدققين والرسوم — بدون سك جديد في السنوات 1–4.",
    emissionBullets: [
      "السنوات 1–4: تضخم 0% — سقف المليار لا يرتفع.",
      "صندوق المدققين: 200M PPL بجدول 6% / 5% / 5% / 4% من العرض (60M و50M و50M و40M PPL في السنوات 1–4) زائد 30% من كل رسوم بروتوكول.",
      "المؤسسون والمكافآت والسفراء والإيردروب من صندوق المجتمع 35% فقط.",
      "من السنة 5 إصدار جديد بحد أقصى 2% سنويًا وبموافقة المجتمع فقط.",
    ],
    launchOrderTitle: "تسلسل الإطلاق",
    launchOrderBody:
      "إيردروب المؤسسين أولًا. بيع PPL للمجتمع فقط بعد 1,000 شخص موثّق وmultisig منشور.",
    feeTitle: "تقسيم رسوم الشبكة",
    feeLead: "كل رسوم بروتوكول على People تتبع Model A المعتمدة:",
  },
  en: {
    supplyBody:
      "Total supply is fixed at 1,000,000,000 PPL (one billion). In years 1–4 there is 0% inflation — no new coins beyond the unlock schedules below. From year 5, any additional emission is capped at 2% per year and only by community vote.",
    bucketNotes: {
      community:
        "35% genesis bucket — founders, bounties, ambassadors, airdrops and onboarding rewards only from this pool (released over 6 years).",
      validators:
        "200M PPL (20%): years 1–4 pay 6%, 5%, 5%, 4% of total supply per year (60M / 50M / 50M / 40M), plus 30% of network fees.",
    },
    saleLead:
      "Up to 100M PPL from the sale bucket are reserved for a public bonding curve after the founders airdrop. The sale stays closed until an operating entity for the sale exists.",
    emissionTitle: "Emission and validator rewards",
    emissionLead:
      "Security rewards come from the pre-allocated validator pool and network fees — not from minting new supply in years 1–4.",
    emissionBullets: [
      "Years 1–4: 0% inflation — the one-billion cap is not increased.",
      "Validator pool: 200M PPL unlocked on a 6% / 5% / 5% / 4% of total supply schedule (60M, 50M, 50M, 40M PPL in years 1–4), plus 30% of every protocol fee.",
      "Founders, bounties, ambassadors and airdrops are funded only from the 35% community & rewards bucket.",
      "From year 5 onward, new emission is at most 2% per year and requires a community governance vote.",
    ],
    launchOrderTitle: "Launch sequence",
    launchOrderBody:
      "Founders airdrop runs first. The community PPL sale opens only after 1,000 verified people are registered and sale proceeds are secured by a published multisig.",
    feeTitle: "Network fee split",
    feeLead: "Every protocol fee on People follows the approved Model A routing:",
  },
};

for (const [lang, patch] of Object.entries(tokenomics)) {
  const path = join(surfaces, `tokenomics-${lang}.json`);
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const { bucketNotes, ...rest } = patch;
  Object.assign(doc, rest);
  if (bucketNotes) Object.assign(doc.bucketNotes, bucketNotes);
  writeFileSync(path, `${JSON.stringify(doc)}\n`);
}

const hiwBlock = {
  en: {
    id: "ppl-supply",
    title: "Fixed PPL supply",
    intro:
      "One billion PPL, no surprise minting in the early years. Validators and launch rewards come from genesis buckets and fees.",
    bullets: [
      "Years 1–4: 0% inflation — supply stays at 1B PPL.",
      "Validators: 200M PPL pool paid 6% / 5% / 5% / 4% of total supply per year (60M, 50M, 50M, 40M) plus 30% of network fees.",
      "Founders, bounties, ambassadors and airdrops: only from the 35% community pool.",
      "From year 5: at most 2% new emission per year, community vote only.",
      "Founders airdrop first; public sale after 1,000 verified people and a multisig.",
      "Every protocol fee: 30% validators, 25% community pool, 20% treasury, 10% liquidity, 15% Growth Pool, 0% burn.",
    ],
  },
  ru: {
    id: "ppl-supply",
    title: "Фиксированный выпуск PPL",
    intro:
      "Один миллиард PPL без неожиданного выпуска в первые годы. Валидаторы и стартовые награды — из корзин genesis и комиссий.",
    bullets: [
      "Годы 1–4: инфляция 0% — supply остаётся 1B PPL.",
      "Валидаторы: пул 200M PPL, график 6% / 5% / 5% / 4% от total supply в год (60M, 50M, 50M, 40M) плюс 30% сетевых комиссий.",
      "Основатели, гранты, амбассадоры и аирдропы — только из пула сообщества 35%.",
      "С 5-го года: не более 2% новой эмиссии в год, только голосование сообщества.",
      "Сначала airdrop основателям; продажа — после 1 000 verified people и мультисига.",
      "Каждая комиссия: 30% валидаторам, 25% пулу сообщества, 20% казне, 10% ликвидности, 15% Growth Pool, 0% сжигание.",
    ],
  },
  es: {
    id: "ppl-supply",
    title: "Oferta fija de PPL",
    intro: "Mil millones de PPL sin acuñación sorpresa al inicio. Validadores y recompensas de lanzamiento salen de genesis y comisiones.",
    bullets: [
      "Años 1–4: 0% inflación — 1B PPL.",
      "Validadores: 200M PPL, 6% / 5% / 5% / 4% del supply anual (60M, 50M, 50M, 40M) + 30% comisiones.",
      "Fundadores, recompensas, embajadores y airdrops: solo fondo comunitario 35%.",
      "Desde año 5: máx. 2% emisión nueva/año, solo voto comunitario.",
      "Airdrop fundadores primero; venta tras 1.000 verificados y multisig.",
      "Cada comisión: 30% validadores, 25% comunidad, 20% tesorería, 10% liquidez, 15% Growth, 0% quema.",
    ],
  },
  pt: {
    id: "ppl-supply",
    title: "Oferta fixa de PPL",
    intro: "Um bilhão de PPL sem mint surpresa nos primeiros anos. Validadores e recompensas vêm de genesis e taxas.",
    bullets: [
      "Anos 1–4: 0% inflação — 1B PPL.",
      "Validadores: 200M PPL, 6% / 5% / 5% / 4% do supply (60M, 50M, 50M, 40M) + 30% taxas.",
      "Fundadores, recompensas, embaixadores e airdrops: só fundo 35%.",
      "Do ano 5: máx. 2% emissão nova/ano, só voto comunitário.",
      "Airdrop fundadores primeiro; venda após 1.000 verificados e multisig.",
      "Cada taxa: 30% validadores, 25% comunidade, 20% tesouraria, 10% liquidez, 15% Growth, 0% queima.",
    ],
  },
  fr: {
    id: "ppl-supply",
    title: "Offre fixe de PPL",
    intro: "Un milliard de PPL sans frappe surprise au début. Validateurs et récompenses de lancement depuis genesis et frais.",
    bullets: [
      "Années 1–4 : 0 % inflation — 1B PPL.",
      "Validateurs : 200M PPL, 6 % / 5 % / 5 % / 4 % du supply (60M, 50M, 50M, 40M) + 30 % frais.",
      "Fondateurs, primes, ambassadeurs, airdrops : fonds 35 % seulement.",
      "À partir de l’an 5 : max 2 % émission/an, vote communautaire.",
      "Airdrop fondateurs d’abord ; vente après 1 000 vérifiés et multisig.",
      "Chaque frais : 30 % validateurs, 25 % communauté, 20 % trésorerie, 10 % liquidité, 15 % Growth, 0 % burn.",
    ],
  },
  de: {
    id: "ppl-supply",
    title: "Festes PPL-Angebot",
    intro: "Eine Milliarde PPL ohne Überraschungs-Minting am Anfang. Validatoren und Startprämien aus Genesis und Gebühren.",
    bullets: [
      "Jahre 1–4: 0 % Inflation — 1B PPL.",
      "Validatoren: 200M PPL, 6 % / 5 % / 5 % / 4 % des Angebots (60M, 50M, 50M, 40M) + 30 % Gebühren.",
      "Gründer, Prämien, Botschafter, Airdrops: nur 35 %-Community-Topf.",
      "Ab Jahr 5: max. 2 % neue Emission/Jahr, nur Community-Vote.",
      "Gründer-Airdrop zuerst; Verkauf nach 1.000 Verifizierten und Multisig.",
      "Jede Gebühr: 30 % Validatoren, 25 % Community, 20 % Treasury, 10 % Liquidität, 15 % Growth, 0 % Burn.",
    ],
  },
  it: {
    id: "ppl-supply",
    title: "Offerta fissa di PPL",
    intro: "Un miliardo di PPL senza mint a sorpresa all’inizio. Validatori e ricompense da genesis e commissioni.",
    bullets: [
      "Anni 1–4: 0% inflazione — 1B PPL.",
      "Validatori: 200M PPL, 6% / 5% / 5% / 4% del supply (60M, 50M, 50M, 40M) + 30% commissioni.",
      "Fondatori, bounty, ambasciatori, airdrop: solo fondo 35%.",
      "Dal quinto anno: max 2% emissione/anno, solo voto community.",
      "Airdrop fondatori prima; vendita dopo 1.000 verificati e multisig.",
      "Ogni commissione: 30% validatori, 25% community, 20% tesoreria, 10% liquidità, 15% Growth, 0% burn.",
    ],
  },
  tr: {
    id: "ppl-supply",
    title: "Sabit PPL arzı",
    intro: "İlk yıllarda sürpriz basım yok — bir milyar PPL. Doğrulayıcılar ve lansman ödülleri genesis ve ücretlerden.",
    bullets: [
      "Yıl 1–4: %0 enflasyon — 1B PPL.",
      "Doğrulayıcılar: 200M PPL, %6 / %5 / %5 / %4 arz (60M, 50M, 50M, 40M) + %30 ücret.",
      "Kurucular, ödüller, elçiler, airdrop: yalnızca %35 topluluk havuzu.",
      "5. yıldan: yılda en fazla %2 yeni emisyon, topluluk oyu.",
      "Önce kurucu airdrop; satış 1.000 doğrulanmış + multisig sonrası.",
      "Her ücret: %30 doğrulayıcı, %25 topluluk, %20 hazine, %10 likidite, %15 Growth, %0 yakım.",
    ],
  },
  vi: {
    id: "ppl-supply",
    title: "Cung PPL cố định",
    intro: "Một tỷ PPL, không đúc bất ngờ những năm đầu. Validator và thưởng khởi động từ genesis và phí.",
    bullets: [
      "Năm 1–4: 0% lạm phát — 1B PPL.",
      "Validator: 200M PPL, 6% / 5% / 5% / 4% cung (60M, 50M, 50M, 40M) + 30% phí.",
      "Nhà sáng lập, thưởng, đại sứ, airdrop: chỉ quỹ 35%.",
      "Từ năm 5: tối đa 2% phát hành/năm, bỏ phiếu cộng đồng.",
      "Airdrop nhà sáng lập trước; bán sau 1.000 xác minh và multisig.",
      "Mỗi phí: 30% validator, 25% cộng đồng, 20% kho bạc, 10% thanh khoản, 15% Growth, 0% đốt.",
    ],
  },
  id: {
    id: "ppl-supply",
    title: "Pasokan PPL tetap",
    intro: "Satu miliar PPL tanpa mint kejutan di awal. Validator dan hadiah peluncuran dari genesis dan biaya.",
    bullets: [
      "Tahun 1–4: inflasi 0% — 1B PPL.",
      "Validator: 200M PPL, 6% / 5% / 5% / 4% pasokan (60M, 50M, 50M, 40M) + 30% biaya.",
      "Pendiri, hadiah, duta, airdrop: hanya kolam 35%.",
      "Dari tahun 5: maks. 2% emisi/tahun, voting komunitas.",
      "Airdrop pendiri dulu; jual setelah 1.000 terverifikasi dan multisig.",
      "Setiap biaya: 30% validator, 25% komunitas, 20% treasury, 10% likuiditas, 15% Growth, 0% burn.",
    ],
  },
  zh: {
    id: "ppl-supply",
    title: "固定 PPL 供应",
    intro: "十亿 PPL，早期无意外增发。验证者与启动奖励来自创世池与手续费。",
    bullets: [
      "第 1–4 年：0% 通胀——维持 1B PPL。",
      "验证者：200M PPL 池，每年总供应 6% / 5% / 5% / 4%（60M、50M、50M、40M）+ 手续费 30%。",
      "创始人、赏金、大使、空投：仅 35% 社区池。",
      "第 5 年起：每年新发行最多 2%，须社区投票。",
      "先创始人空投；1,000 已验证用户与多签后公开销售。",
      "每笔协议费：验证者 30%、社区 25%、国库 20%、流动性 10%、Growth 15%、销毁 0%。",
    ],
  },
  ar: {
    id: "ppl-supply",
    title: "عرض PPL ثابت",
    intro: "مليار PPL دون سك مفاجئ في السنوات الأولى. المدققون ومكافآت الإطلاق من genesis والرسوم.",
    bullets: [
      "السنوات 1–4: تضخم 0% — 1B PPL.",
      "المدققون: 200M PPL، 6% / 5% / 5% / 4% من العرض (60M، 50M، 50M، 40M) + 30% رسوم.",
      "المؤسسون والمكافآت والسفراء والإيردروب: صندوق 35% فقط.",
      "من السنة 5: إصدار جديد بحد 2% سنويًا وبموافقة المجتمع.",
      "إيردروب المؤسسين أولًا؛ البيع بعد 1,000 موثّق وmultisig.",
      "كل رسوم: 30% مدققون، 25% مجتمع، 20% خزينة، 10% سيولة، 15% Growth، 0% حرق.",
    ],
  },
};

for (const [lang, block] of Object.entries(hiwBlock)) {
  const path = join(surfaces, `hiw-${lang}.json`);
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const idx = doc.blocks.findIndex((b) => b.id === "rewards");
  const without = doc.blocks.filter((b) => b.id !== "ppl-supply");
  const insertAt = idx >= 0 ? idx : without.length;
  without.splice(insertAt, 0, block);
  doc.blocks = without;
  writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
}

const roadmapSummary = {
  en: "Fixed 1B PPL: years 1–4 at 0% inflation; validator pool 200M on a 6/5/5/4% schedule plus 30% of fees; launch rewards from the 35% community pool; from year 5 max 2%/year by vote; founders airdrop before sale at 1,000 verified people + multisig. Fee split 30/25/20/10/15/0 on /tokenomics and /how-it-works.",
  ru: "Фиксированный 1B PPL: годы 1–4 — 0% инфляции; пул валидаторов 200M по графику 6/5/5/4% + 30% комиссий; стартовые награды из пула 35%; с 5-го года — не более 2%/год по голосованию; airdrop основателям до продажи при 1 000 verified + multisig. Комиссии 30/25/20/10/15/0 на /tokenomics и /how-it-works.",
  es: "1B PPL fijo: años 1–4 sin inflación; pool validadores 200M con 6/5/5/4% + 30% comisiones; recompensas de lanzamiento desde el 35% comunitario; desde año 5 máx. 2%/año por voto; airdrop fundadores antes de la venta con 1.000 verificados y multisig. Comisiones 30/25/20/10/15/0 en /tokenomics y /how-it-works.",
  pt: "1B PPL fixo: anos 1–4 com 0% inflação; pool 200M com 6/5/5/4% + 30% taxas; recompensas do 35% comunitário; do ano 5 máx. 2%/ano por voto; airdrop fundadores antes da venda com 1.000 verificados e multisig. Taxas 30/25/20/10/15/0 em /tokenomics e /how-it-works.",
  fr: "1B PPL fixe : années 1–4 à 0 % d’inflation ; pool 200M selon 6/5/5/4 % + 30 % frais ; lancement depuis le fonds 35 % ; à partir de l’an 5 max 2 %/an par vote ; airdrop fondateurs avant vente à 1 000 vérifiés + multisig. Frais 30/25/20/10/15/0 sur /tokenomics et /how-it-works.",
  de: "Festes 1B PPL: Jahre 1–4 0 % Inflation; Validator-Pool 200M mit 6/5/5/4 % + 30 % Gebühren; Start aus 35 %-Community-Topf; ab Jahr 5 max. 2 %/Jahr per Vote; Gründer-Airdrop vor Verkauf bei 1.000 Verifizierten + Multisig. Gebühren 30/25/20/10/15/0 auf /tokenomics und /how-it-works.",
  it: "1B PPL fisso: anni 1–4 a 0% inflazione; pool 200M con 6/5/5/4% + 30% commissioni; lancio dal fondo 35%; dal quinto anno max 2%/anno per voto; airdrop fondatori prima della vendita con 1.000 verificati e multisig. Commissioni 30/25/20/10/15/0 su /tokenomics e /how-it-works.",
  tr: "Sabit 1B PPL: yıl 1–4 %0 enflasyon; 200M doğrulayıcı havuzu 6/5/5/4% + %30 ücret; lansman ödülleri %35 topluluk havuzundan; 5. yıldan yılda en fazla %2 oyla; kurucu airdrop, 1.000 doğrulanmış + multisig sonrası satış. Ücretler 30/25/20/10/15/0 — /tokenomics ve /how-it-works.",
  vi: "1B PPL cố định: năm 1–4 0% lạm phát; quỹ validator 200M theo 6/5/5/4% + 30% phí; thưởng khởi động từ quỹ 35%; từ năm 5 tối đa 2%/năm bỏ phiếu; airdrop nhà sáng lập trước bán khi 1.000 xác minh + multisig. Phí 30/25/20/10/15/0 trên /tokenomics và /how-it-works.",
  id: "1B PPL tetap: tahun 1–4 inflasi 0%; kolam validator 200M jadwal 6/5/5/4% + 30% biaya; hadiah peluncuran dari kolam 35%; dari tahun 5 maks. 2%/tahun voting; airdrop pendiri sebelum jual dengan 1.000 terverifikasi + multisig. Biaya 30/25/20/10/15/0 di /tokenomics dan /how-it-works.",
  zh: "固定 10 亿 PPL：第 1–4 年 0% 通胀；200M 验证者池按 6/5/5/4% + 手续费 30%；启动奖励仅 35% 社区池；第 5 年起每年最多 2% 须投票；创始人空投先于销售（1,000 已验证 + 多签）。手续费 30/25/20/10/15/0，见 /tokenomics 与 /how-it-works。",
  ar: "1B PPL ثابت: السنوات 1–4 تضخم 0%; صندوق مدققين 200M بجدول 6/5/5/4% + 30% رسوم; مكافآت الإطلاق من صندوق 35%; من السنة 5 حد 2%/سنة بالتصويت; إيردروب المؤسسين قبل البيع عند 1,000 موثّق وmultisig. رسوم 30/25/20/10/15/0 على /tokenomics و/how-it-works.",
};

for (const [lang, summary] of Object.entries(roadmapSummary)) {
  const path = join(surfaces, `roadmap-${lang}.json`);
  const doc = JSON.parse(readFileSync(path, "utf8"));
  if (doc.items?.["tokenomics-1b-ppl"]) {
    doc.items["tokenomics-1b-ppl"].summary = summary;
    writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
  }
}

console.log("Emission copy applied to tokenomics, hiw, and roadmap surfaces.");
