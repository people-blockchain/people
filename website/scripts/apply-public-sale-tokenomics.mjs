#!/usr/bin/env node
/**
 * Patch tokenomics-*.json surfaces with public PPL sale curve copy (aligned with tokenomics-content.ts EN/RU).
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const surfaces = join(dirname(fileURLToPath(import.meta.url)), "../src/lib/locales/surfaces");

/** @type {Record<string, Record<string, unknown>>} */
const patchByLang = {
  en: {
    saleLead:
      "Up to 100M PPL from the sale bucket (10% of the fixed supply) are sold on a public exponential curve. Published parameters match the live /buy page and the order API.",
    salePayBody:
      "Pay with USDC or USDT from Ethereum, BNB Chain, Polygon, Arbitrum, Base, TON, Tron or Solana. One curve, one price — whatever network you pay from. Sell payouts default to USDC on Base unless you choose another chain.",
    curveLead:
      "Exponential curve: price starts at $0.005 per PPL and rises with every purchase, up to a $0.25 ceiling while the curve is open. Graduation closes the curve at $4M raised.",
    unsoldBody:
      "The sale runs until all PPL is sold or for 24 months, whichever comes first. The term is fixed and will not be extended. After it ends, whatever was raised is split 50/50 between locked LP and the project multisig, and any unsold PPL on the curve goes to the community pool; there are no refunds. Until then, unsold PPL is held in the project multisig and the team does not touch it. Token curves on PEOPLE keep their own 180-day finalize rule for unsold tokens.",
    salePublicTitle: "Published sale parameters",
    salePublicBody:
      "Prices, limits and the curve formula are public on /buy. Purchases stay disabled until the sale hub contract is deployed; connecting a wallet does not commit you to anything.",
    salePublicCta: "Open the /buy page",
    saleCurveBullets: [
      "100,000,000 PPL on the curve (10% of supply); start $0.005, exponential rise, $0.25 cap on the curve only.",
      "Graduation at $4,000,000 raised. Sale runs until all PPL is sold or 24 months (fixed term); then unsold PPL to the community pool.",
      "Raise split 50% locked liquidity / 50% project multisig; LP tokens locked 24 months.",
      "Sell-back allowed with a 1.5% fee to PPL buyback. Limits: $500 per buy, $2,000 per person per day, 60s cooldown.",
    ],
    curveTableSold: "% sold",
    curveTablePrice: "Spot price (USDT)",
    curveTableRaised: "Raised (USDT)",
  },
  ru: {
    saleLead:
      "До 100M PPL из корзины продажи (10% фиксированной эмиссии) продаются на публичной экспоненциальной кривой. Параметры совпадают со страницей /buy и API заказов.",
    salePayBody:
      "USDC или USDT из Ethereum, BNB Chain, Polygon, Arbitrum, Base, TON, Tron или Solana. Одна кривая, одна цена — с какой сети ни платите. Выплаты при продаже по умолчанию — USDC в Base, если не выбрана другая сеть.",
    curveLead:
      "Экспоненциальная кривая: цена стартует с $0.005 за PPL и растёт с каждой покупкой, до потолка $0.25, пока кривая открыта. Выпуск закрывается при сборе $4M.",
    unsoldBody:
      "Продажа идёт, пока не распроданы все PPL или не истекут 24 месяца — что наступит раньше. Срок фиксирован и не продлевается. После окончания собранное делится 50/50 между заблокированной LP и мультисигом проекта, непроданные PPL на кривой уходят в пул сообщества; возвратов нет. До этого непроданные PPL хранятся в мультисиге проекта, команда их не трогает. У кривых токенов на PEOPLE остаётся своё правило финализации через 180 дней для непроданного остатка.",
    salePublicTitle: "Опубликованные параметры продажи",
    salePublicBody:
      "Цены, лимиты и формула кривой публичны на /buy. Покупка отключена, пока не развёрнут hub-контракт продажи; подключение кошелька ни к чему не обязывает.",
    salePublicCta: "Открыть страницу /buy",
    saleCurveBullets: [
      "100 000 000 PPL на кривой (10% эмиссии); старт $0.005, экспоненциальный рост, потолок $0.25 только на кривой.",
      "Выпуск при $4 000 000 собранных. Продажа — пока не распроданы все PPL или 24 месяца (фиксированный срок); затем непроданные PPL — в пул сообщества.",
      "Сбор 50% в заблокированную ликвидность / 50% в мультисиг проекта; LP заблокированы на 24 месяца.",
      "Обратная продажа разрешена; комиссия 1,5% на buyback PPL. Лимиты: $500 за покупку, $2000 на человека в сутки, пауза 60 с.",
    ],
    curveTableSold: "% продано",
    curveTablePrice: "Спот-цена (USDT)",
    curveTableRaised: "Собрано (USDT)",
  },
  es: {
    saleLead:
      "Hasta 100M PPL del tramo de venta (10% de la oferta fija) se venden en una curva exponencial pública. Los parámetros publicados coinciden con la página /buy y la API de pedidos.",
    salePayBody:
      "Paga con USDC o USDT desde Ethereum, BNB Chain, Polygon, Arbitrum, Base, TON, Tron o Solana. Una curva, un precio — desde la red que elijas. Las ventas de vuelta pagan USDC en Base por defecto, salvo que elijas otra cadena.",
    curveLead:
      "Curva exponencial: el precio empieza en $0,005 por PPL y sube con cada compra, hasta un tope de $0,25 mientras la curva esté abierta. La graduación cierra la curva al reunir $4M.",
    unsoldBody:
      "La venta dura hasta que se vendan todos los PPL o durante 24 meses, lo que ocurra primero. El plazo es fijo y no se prorrogará. Al terminar, lo recaudado se reparte 50/50 entre LP bloqueada y el multisig del proyecto, y cualquier PPL no vendido en la curva va al fondo comunitario; no hay reembolsos. Hasta entonces, los PPL no vendidos permanecen en el multisig del proyecto y el equipo no los toca. Las curvas de tokens en PEOPLE conservan su propia regla de cierre a los 180 días para lo no vendido.",
    salePublicTitle: "Parámetros publicados de la venta",
    salePublicBody:
      "Precios, límites y la fórmula de la curva son públicos en /buy. Las compras siguen desactivadas hasta desplegar el contrato hub de la venta; conectar la cartera no te compromete a nada.",
    salePublicCta: "Abrir la página /buy",
    saleCurveBullets: [
      "100.000.000 PPL en la curva (10% de la oferta); inicio $0,005, subida exponencial, tope $0,25 solo en la curva.",
      "Graduación al reunir $4.000.000. La venta dura hasta agotar PPL o 24 meses (plazo fijo); luego PPL no vendido al fondo comunitario.",
      "Recaudación 50% liquidez bloqueada / 50% multisig del proyecto; tokens LP bloqueados 24 meses.",
      "Reventa a la curva permitida con comisión del 1,5% para buyback de PPL. Límites: $500 por compra, $2000 por persona al día, pausa de 60 s.",
    ],
    curveTableSold: "% vendido",
    curveTablePrice: "Precio spot (USDT)",
    curveTableRaised: "Recaudado (USDT)",
  },
  pt: {
    saleLead:
      "Até 100M PPL do lote de venda (10% da oferta fixa) são vendidos em uma curva exponencial pública. Os parâmetros publicados coincidem com a página /buy e a API de pedidos.",
    salePayBody:
      "Pague com USDC ou USDT em Ethereum, BNB Chain, Polygon, Arbitrum, Base, TON, Tron ou Solana. Uma curva, um preço — de qualquer rede. Pagamentos de venda de volta usam USDC na Base por padrão, salvo se escolher outra chain.",
    curveLead:
      "Curva exponencial: o preço começa em $0,005 por PPL e sobe a cada compra, até um teto de $0,25 enquanto a curva estiver aberta. A graduação fecha a curva ao arrecadar $4M.",
    unsoldBody:
      "A venda segue até vender todo o PPL ou por 24 meses, o que vier primeiro. O prazo é fixo e não será prorrogado. Ao terminar, o arrecadado é dividido 50/50 entre LP bloqueada e o multisig do projeto, e qualquer PPL não vendido na curva vai para o fundo comunitário; não há reembolsos. Até então, PPL não vendido fica no multisig do projeto e a equipe não o toca. Curvas de tokens na PEOPLE mantêm a própria regra de finalização em 180 dias para o não vendido.",
    salePublicTitle: "Parâmetros publicados da venda",
    salePublicBody:
      "Preços, limites e a fórmula da curva são públicos em /buy. Compras permanecem desativadas até o contrato hub da venda ser implantado; conectar a carteira não te compromete com nada.",
    salePublicCta: "Abrir a página /buy",
    saleCurveBullets: [
      "100.000.000 PPL na curva (10% da oferta); início $0,005, alta exponencial, teto $0,25 só na curva.",
      "Graduação ao arrecadar $4.000.000. Venda até esgotar PPL ou 24 meses (prazo fixo); depois PPL não vendido vai ao fundo comunitário.",
      "Arrecadação 50% liquidez bloqueada / 50% multisig do projeto; tokens LP bloqueados por 24 meses.",
      "Revenda à curva permitida com taxa de 1,5% para buyback de PPL. Limites: $500 por compra, $2000 por pessoa por dia, pausa de 60 s.",
    ],
    curveTableSold: "% vendido",
    curveTablePrice: "Preço spot (USDT)",
    curveTableRaised: "Arrecadado (USDT)",
  },
  fr: {
    saleLead:
      "Jusqu'à 100M PPL du lot de vente (10 % de l'offre fixe) sont vendus sur une courbe exponentielle publique. Les paramètres publiés correspondent à la page /buy et à l'API de commandes.",
    salePayBody:
      "Payez en USDC ou USDT depuis Ethereum, BNB Chain, Polygon, Arbitrum, Base, TON, Tron ou Solana. Une courbe, un prix — quel que soit le réseau. Les paiements de revente sont en USDC sur Base par défaut, sauf si vous choisissez une autre chaîne.",
    curveLead:
      "Courbe exponentielle : le prix démarre à 0,005 $ par PPL et monte à chaque achat, jusqu'à un plafond de 0,25 $ tant que la courbe est ouverte. La graduation ferme la courbe à 4 M$ levés.",
    unsoldBody:
      "La vente dure jusqu'à ce que tous les PPL soient vendus ou pendant 24 mois, selon la première échéance. Le délai est fixe et ne sera pas prolongé. À la fin, les fonds levés sont partagés 50/50 entre LP verrouillée et multisig du projet, et tout PPL invendu sur la courbe va au fonds communautaire ; aucun remboursement. D'ici là, les PPL invendus sont détenus par le multisig du projet et l'équipe n'y touche pas. Les courbes de jetons sur PEOPLE gardent leur propre règle de finalisation à 180 jours pour l'invendu.",
    salePublicTitle: "Paramètres de vente publiés",
    salePublicBody:
      "Prix, limites et formule de la courbe sont publics sur /buy. Les achats restent désactivés tant que le contrat hub de vente n'est pas déployé ; connecter un portefeuille ne vous engage à rien.",
    salePublicCta: "Ouvrir la page /buy",
    saleCurveBullets: [
      "100 000 000 PPL sur la courbe (10 % de l'offre) ; départ 0,005 $, hausse exponentielle, plafond 0,25 $ sur la courbe seulement.",
      "Graduation à 4 000 000 $ levés. Vente jusqu'à épuisement des PPL ou 24 mois (délai fixe) ; PPL invendu vers le fonds communautaire.",
      "Levée 50 % liquidité verrouillée / 50 % multisig projet ; jetons LP verrouillés 24 mois.",
      "Revente à la courbe autorisée avec frais de 1,5 % pour le buyback PPL. Limites : 500 $ par achat, 2 000 $ par personne et par jour, pause de 60 s.",
    ],
    curveTableSold: "% vendu",
    curveTablePrice: "Prix spot (USDT)",
    curveTableRaised: "Levé (USDT)",
  },
  de: {
    saleLead:
      "Bis zu 100M PPL aus dem Verkaufsbudget (10 % des festen Angebots) werden auf einer öffentlichen Exponentialkurve verkauft. Veröffentlichte Parameter entsprechen der Live-Seite /buy und der Order-API.",
    salePayBody:
      "Zahlen Sie mit USDC oder USDT von Ethereum, BNB Chain, Polygon, Arbitrum, Base, TON, Tron oder Solana. Eine Kurve, ein Preis — unabhängig vom Netzwerk. Rückverkaufs-Auszahlungen standardmäßig USDC auf Base, sofern Sie keine andere Chain wählen.",
    curveLead:
      "Exponentialkurve: Der Preis startet bei 0,005 $ pro PPL und steigt mit jedem Kauf bis zu einer Obergrenze von 0,25 $, solange die Kurve offen ist. Graduation schließt die Kurve bei 4 M$ Einnahmen.",
    unsoldBody:
      "Der Verkauf läuft, bis alle PPL verkauft sind oder 24 Monate vergangen sind — je nachdem, was zuerst eintritt. Die Laufzeit ist fest und wird nicht verlängert. Danach wird das Eingenommene 50/50 zwischen gesperrter LP und Projekt-Multisig geteilt; nicht verkaufte PPL auf der Kurve gehen in den Community-Pool; keine Erstattungen. Bis dahin liegen unverkaufte PPL im Projekt-Multisig, das Team greift nicht zu. Token-Kurven auf PEOPLE behalten ihre eigene 180-Tage-Finalisierungsregel für Unverkauftes.",
    salePublicTitle: "Veröffentlichte Verkaufsparameter",
    salePublicBody:
      "Preise, Limits und Kurvenformel sind öffentlich auf /buy. Käufe bleiben deaktiviert, bis der Sale-Hub-Vertrag deployed ist; Wallet verbinden verpflichtet zu nichts.",
    salePublicCta: "Seite /buy öffnen",
    saleCurveBullets: [
      "100.000.000 PPL auf der Kurve (10 % des Angebots); Start 0,005 $, exponentieller Anstieg, Deckel 0,25 $ nur auf der Kurve.",
      "Graduation bei 4.000.000 $ Einnahmen. Verkauf bis Ausverkauf oder 24 Monate (feste Laufzeit); danach unverkaufte PPL in den Community-Pool.",
      "Einnahmen 50 % gesperrte Liquidität / 50 % Projekt-Multisig; LP-Tokens 24 Monate gesperrt.",
      "Rückverkauf an die Kurve mit 1,5 % Gebühr für PPL-Buyback. Limits: 500 $ pro Kauf, 2.000 $ pro Person und Tag, 60 s Pause.",
    ],
    curveTableSold: "% verkauft",
    curveTablePrice: "Spotpreis (USDT)",
    curveTableRaised: "Eingenommen (USDT)",
  },
  it: {
    saleLead:
      "Fino a 100M PPL dal lotto di vendita (10% dell'offerta fissa) vengono venduti su una curva esponenziale pubblica. I parametri pubblicati coincidono con la pagina /buy e l'API ordini.",
    salePayBody:
      "Paga con USDC o USDT da Ethereum, BNB Chain, Polygon, Arbitrum, Base, TON, Tron o Solana. Una curva, un prezzo — da qualsiasi rete. I pagamenti di rivendita usano USDC su Base per impostazione predefinita, salvo altra chain.",
    curveLead:
      "Curva esponenziale: il prezzo parte da $0,005 per PPL e sale a ogni acquisto, fino a un tetto di $0,25 mentre la curva è aperta. La graduation chiude la curva a $4M raccolti.",
    unsoldBody:
      "La vendita dura finché non si vendono tutti i PPL o per 24 mesi, a seconda di cosa avviene prima. Il termine è fisso e non sarà prorogato. Alla fine, quanto raccolto è diviso 50/50 tra LP bloccata e multisig del progetto; ogni PPL non venduto sulla curva va al fondo community; nessun rimborso. Fino ad allora i PPL non venduti restano nel multisig del progetto e il team non li tocca. Le curve dei token su PEOPLE mantengono la propria regola di finalizzazione a 180 giorni per l'invenduto.",
    salePublicTitle: "Parametri di vendita pubblicati",
    salePublicBody:
      "Prezzi, limiti e formula della curva sono pubblici su /buy. Gli acquisti restano disabilitati finché non è deployato il contratto hub della vendita; connettere il wallet non impegna a nulla.",
    salePublicCta: "Apri la pagina /buy",
    saleCurveBullets: [
      "100.000.000 PPL sulla curva (10% dell'offerta); partenza $0,005, crescita esponenziale, tetto $0,25 solo sulla curva.",
      "Graduation a $4.000.000 raccolti. Vendita fino a esaurimento PPL o 24 mesi (termine fisso); poi PPL non venduto al fondo community.",
      "Raccolta 50% liquidità bloccata / 50% multisig progetto; token LP bloccati 24 mesi.",
      "Rivendita alla curva consentita con commissione 1,5% per buyback PPL. Limiti: $500 per acquisto, $2000 a persona al giorno, pausa 60 s.",
    ],
    curveTableSold: "% venduto",
    curveTablePrice: "Prezzo spot (USDT)",
    curveTableRaised: "Raccolto (USDT)",
  },
  tr: {
    saleLead:
      "Satış havuzundaki 100M PPL'ye kadar (%10 sabit arz) halka açık üstel eğri üzerinde satılır. Yayınlanan parametreler canlı /buy sayfası ve sipariş API'si ile uyumludur.",
    salePayBody:
      "Ethereum, BNB Chain, Polygon, Arbitrum, Base, TON, Tron veya Solana'dan USDC veya USDT ile ödeyin. Tek eğri, tek fiyat — hangi ağdan öderseniz ödeyin. Geri satış ödemeleri varsayılan olarak Base'de USDC'dir; başka zincir seçmediyseniz.",
    curveLead:
      "Üstel eğri: fiyat PPL başına $0,005'ten başlar ve eğri açıkken her alımla $0,25 tavanına kadar yükselir. Mezuniyet eğriyi $4M toplanınca kapatır.",
    unsoldBody:
      "Satış, tüm PPL satılana veya 24 ay dolana kadar — hangisi önce gelirse — sürer. Süre sabittir ve uzatılmaz. Bittiğinde toplanan tutar %50 kilitli LP / %50 proje multisig arasında bölünür; eğrida satılmayan PPL topluluk havuzuna gider; iade yoktur. O zamana kadar satılmayan PPL proje multisig'inde tutulur, ekip dokunmaz. PEOPLE'daki token eğrileri satılmayan için kendi 180 günlük finalize kuralını korur.",
    salePublicTitle: "Yayınlanan satış parametreleri",
    salePublicBody:
      "Fiyatlar, limitler ve eğri formülü /buy'da herkese açıktır. Satış hub sözleşmesi deploy edilene kadar alımlar kapalıdır; cüzdan bağlamak sizi hiçbir şeye bağlamaz.",
    salePublicCta: "/buy sayfasını aç",
    saleCurveBullets: [
      "Eğrida 100.000.000 PPL (arzın %10'u); başlangıç $0,005, üstel artış, yalnızca eğrida $0,25 tavan.",
      "$4.000.000 toplanınca mezuniyet. Satış PPL tükenene veya 24 aya kadar (sabit süre); ardından satılmayan PPL topluluk havuzuna.",
      "Toplanan %50 kilitli likidite / %50 proje multisig; LP tokenları 24 ay kilitli.",
      "Eğriye geri satışa izin; PPL buyback için %1,5 ücret. Limitler: alım başına $500, kişi başına günde $2000, 60 sn bekleme.",
    ],
    curveTableSold: "% satıldı",
    curveTablePrice: "Spot fiyat (USDT)",
    curveTableRaised: "Toplanan (USDT)",
  },
  vi: {
    saleLead:
      "Tối đa 100M PPL từ phần bán (10% cung cố định) được bán trên đường cong mũ công khai. Tham số công bố khớp trang /buy trực tiếp và API đặt hàng.",
    salePayBody:
      "Thanh toán bằng USDC hoặc USDT từ Ethereum, BNB Chain, Polygon, Arbitrum, Base, TON, Tron hoặc Solana. Một đường cong, một giá — bất kể mạng nào. Chi trả bán lại mặc định USDC trên Base trừ khi bạn chọn chuỗi khác.",
    curveLead:
      "Đường cong mũ: giá bắt đầu $0,005 mỗi PPL và tăng theo mỗi lần mua, tới trần $0,25 khi đường cong mở. Tốt nghiệp đóng đường cong ở mức gom $4M.",
    unsoldBody:
      "Đợt bán chạy đến khi bán hết PPL hoặc trong 24 tháng, tùy điều kiện nào đến trước. Thời hạn cố định và không gia hạn. Khi kết thúc, số tiền gom được chia 50/50 giữa LP khóa và multisig dự án; PPL chưa bán trên đường cong vào quỹ cộng đồng; không hoàn tiền. Trước đó PPL chưa bán được giữ trong multisig dự án, đội ngũ không chạm vào. Đường cong token trên PEOPLE giữ quy tắc finalize 180 ngày riêng cho phần chưa bán.",
    salePublicTitle: "Tham số bán hàng đã công bố",
    salePublicBody:
      "Giá, giới hạn và công thức đường cong công khai trên /buy. Mua hàng vẫn tắt cho đến khi hub hợp đồng bán được triển khai; kết nối ví không ràng buộc gì.",
    salePublicCta: "Mở trang /buy",
    saleCurveBullets: [
      "100.000.000 PPL trên đường cong (10% cung); bắt đầu $0,005, tăng mũ, trần $0,25 chỉ trên đường cong.",
      "Tốt nghiệp khi gom $4.000.000. Bán đến hết PPL hoặc 24 tháng (thời hạn cố định); sau đó PPL chưa bán vào quỹ cộng đồng.",
      "Gom 50% thanh khoản khóa / 50% multisig dự án; token LP khóa 24 tháng.",
      "Cho phép bán lại đường cong với phí 1,5% cho buyback PPL. Giới hạn: $500 mỗi lần mua, $2000 mỗi người mỗi ngày, nghỉ 60 giây.",
    ],
    curveTableSold: "% đã bán",
    curveTablePrice: "Giá spot (USDT)",
    curveTableRaised: "Đã gom (USDT)",
  },
  id: {
    saleLead:
      "Hingga 100M PPL dari bagian penjualan (10% pasokan tetap) dijual pada kurva eksponensial publik. Parameter yang dipublikasikan selaras dengan halaman /buy langsung dan API pesanan.",
    salePayBody:
      "Bayar dengan USDC atau USDT dari Ethereum, BNB Chain, Polygon, Arbitrum, Base, TON, Tron, atau Solana. Satu kurva, satu harga — dari jaringan mana pun. Pembayaran jual kembali default USDC di Base kecuali Anda memilih chain lain.",
    curveLead:
      "Kurva eksponensial: harga mulai $0,005 per PPL dan naik setiap pembelian, hingga batas $0,25 selama kurva terbuka. Graduation menutup kurva saat terkumpul $4M.",
    unsoldBody:
      "Penjualan berjalan sampai semua PPL terjual atau selama 24 bulan, mana yang lebih dulu. Jangka waktu tetap dan tidak akan diperpanjang. Setelah berakhir, dana terkumpul dibagi 50/50 antara LP terkunci dan multisig proyek; PPL tidak terjual di kurva masuk ke kolam komunitas; tidak ada pengembalian dana. Sampai saat itu PPL tidak terjual disimpan di multisig proyek dan tim tidak menyentuhnya. Kurva token di PEOPLE mempertahankan aturan finalisasi 180 hari sendiri untuk yang tidak terjual.",
    salePublicTitle: "Parameter penjualan yang dipublikasikan",
    salePublicBody:
      "Harga, batas, dan rumus kurva publik di /buy. Pembelian tetap nonaktif sampai kontrak hub penjualan di-deploy; menghubungkan dompet tidak mengikat Anda.",
    salePublicCta: "Buka halaman /buy",
    saleCurveBullets: [
      "100.000.000 PPL di kurva (10% pasokan); awal $0,005, kenaikan eksponensial, batas $0,25 hanya di kurva.",
      "Graduation saat terkumpul $4.000.000. Penjualan sampai PPL habis atau 24 bulan (jangka tetap); lalu PPL tidak terjual ke kolam komunitas.",
      "Dana 50% likuiditas terkunci / 50% multisig proyek; token LP terkunci 24 bulan.",
      "Jual kembali ke kurva diizinkan dengan biaya 1,5% untuk buyback PPL. Batas: $500 per beli, $2000 per orang per hari, jeda 60 dtk.",
    ],
    curveTableSold: "% terjual",
    curveTablePrice: "Harga spot (USDT)",
    curveTableRaised: "Terkumpul (USDT)",
  },
  zh: {
    saleLead:
      "销售池中最多 100M PPL（固定供应的 10%）在公开指数曲线上出售。已公布参数与线上 /buy 页面及订单 API 一致。",
    salePayBody:
      "可使用 Ethereum、BNB Chain、Polygon、Arbitrum、Base、TON、Tron 或 Solana 上的 USDC 或 USDT 支付。一条曲线、一个价格——无论从何网络付款。卖回默认在 Base 上以 USDC 支付，除非您选择其他链。",
    curveLead:
      "指数曲线：价格从每 PPL $0.005 起，随每次购买上升，曲线开放期间最高 $0.25。达到 $400 万募集额时毕业并关闭曲线。",
    unsoldBody:
      "销售持续至全部 PPL 售完或满 24 个月，以先到者为准。期限固定，不会延长。结束后，已募资金按 50/50 分配至锁定 LP 与项目多签，曲线上未售出的 PPL 进入社区池；不退款。此前未售出的 PPL 由项目多签保管，团队不动用。PEOPLE 上的代币曲线对未售出部分仍适用各自的 180 天 finalize 规则。",
    salePublicTitle: "已公布的销售参数",
    salePublicBody:
      "价格、限额与曲线公式在 /buy 公开。销售 hub 合约部署前购买保持关闭；连接钱包不构成任何承诺。",
    salePublicCta: "打开 /buy 页面",
    saleCurveBullets: [
      "曲线上 100,000,000 PPL（供应 10%）；起始 $0.005，指数上升，仅曲线上限 $0.25。",
      "募集 $4,000,000 时毕业。销售至 PPL 售完或 24 个月（固定期限）；未售出 PPL 进入社区池。",
      "募集 50% 锁定流动性 / 50% 项目多签；LP 代币锁定 24 个月。",
      "允许卖回曲线，1.5% 费用用于 PPL 回购。限额：单次 $500，每人每日 $2000，间隔 60 秒。",
    ],
    curveTableSold: "% 已售",
    curveTablePrice: "现货价 (USDT)",
    curveTableRaised: "已募集 (USDT)",
  },
  ar: {
    saleLead:
      "حتى 100M PPL من حصة البيع (10% من العرض الثابت) تُباع على منحنى أسي علني. المعلمات المنشورة تطابق صفحة /buy المباشرة وواجهة الطلبات.",
    salePayBody:
      "ادفع بـ USDC أو USDT من Ethereum أو BNB Chain أو Polygon أو Arbitrum أو Base أو TON أو Tron أو Solana. منحنى واحد وسعر واحد — من أي شبكة. مدفوعات إعادة البيع افتراضيًا USDC على Base ما لم تختر سلسلة أخرى.",
    curveLead:
      "منحنى أسي: السعر يبدأ عند 0.005$ لكل PPL ويرتفع مع كل شراء، حتى سقف 0.25$ ما دام المنحنى مفتوحًا. التخرج يغلق المنحنى عند جمع 4M$.",
    unsoldBody:
      "يستمر البيع حتى بيع كل PPL أو لمدة 24 شهرًا، أيهما أسبق. المدة ثابتة ولن تُمدَّد. بعد الانتهاء يُقسَّم المجموع 50/50 بين LP مقفلة وmultisig المشروع، وأي PPL غير مباع على المنحنى يذهب إلى صندوق المجتمع؛ لا استرداد. حتى ذلك الحين يُحتفظ بـ PPL غير المباع في multisig المشروع ولا يمسه الفريق. منحنيات الرموز على PEOPLE تحتفظ بقاعدة الإنهاء بعد 180 يومًا الخاصة بها لغير المباع.",
    salePublicTitle: "معلمات البيع المنشورة",
    salePublicBody:
      "الأسعار والحدود وصيغة المنحنى علنية على /buy. الشراء معطّل حتى نشر عقد hub البيع؛ ربط المحفظة لا يلزمك بشيء.",
    salePublicCta: "افتح صفحة /buy",
    saleCurveBullets: [
      "100,000,000 PPL على المنحنى (10% من العرض)؛ بداية 0.005$، ارتفاع أسي، سقف 0.25$ على المنحنى فقط.",
      "التخرج عند جمع 4,000,000$. البيع حتى نفاد PPL أو 24 شهرًا (مدة ثابتة)؛ ثم PPL غير المباع إلى صندوق المجتمع.",
      "المجموع 50% سيولة مقفلة / 50% multisig المشروع؛ رموز LP مقفلة 24 شهرًا.",
      "إعادة البيع للمنحنى مسموحة برسوم 1.5% لbuyback PPL. حدود: 500$ لكل شراء، 2000$ للشخص يوميًا، انتظار 60 ث.",
    ],
    curveTableSold: "% مباع",
    curveTablePrice: "السعر الفوري (USDT)",
    curveTableRaised: "المجموع (USDT)",
  },
};

const LANGS = ["en", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];

for (const lang of LANGS) {
  const path = join(surfaces, `tokenomics-${lang}.json`);
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const patch = patchByLang[lang];
  if (!patch) {
    console.warn(`No patch for ${lang}, skipping`);
    continue;
  }
  delete doc.saleClosedTitle;
  delete doc.saleClosedBody;
  Object.assign(doc, patch);
  writeFileSync(path, `${JSON.stringify(doc)}\n`);
}

// RU lives inline in tokenomics-content.ts — write tokenomics-ru.json if present or for sync tooling
const ruPath = join(surfaces, "tokenomics-ru.json");
try {
  const ruDoc = JSON.parse(readFileSync(ruPath, "utf8"));
  delete ruDoc.saleClosedTitle;
  delete ruDoc.saleClosedBody;
  Object.assign(ruDoc, patchByLang.ru);
  writeFileSync(ruPath, `${JSON.stringify(ruDoc)}\n`);
  console.log("Patched tokenomics-ru.json");
} catch {
  // RU surface JSON optional; TS copy is authoritative for ru
}

const patched = readdirSync(surfaces).filter((f) => f.startsWith("tokenomics-") && f.endsWith(".json"));
console.log(`Public sale tokenomics copy applied to ${patched.length} surface file(s).`);
