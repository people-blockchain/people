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
  "en": {
    "saleLead": "Up to 100M PPL from the sale bucket (10% of the fixed supply) are sold on a public exponential curve. Published parameters match the live /buy page and the order API.",
    "salePayBody": "The sale runs on Base only (one sale contract on Base). Pay with USDC or USDT on Base, or with USDT/USDC from other chains, including Tron and Solana, via the built-in automatic swap widget, which converts to USDC on Base. TON is not supported.",
    "curveLead": "Exponential curve: price starts at $0.005 per PPL and rises with every purchase, up to a $0.25 ceiling while the curve is open. Graduation closes the curve at $4M raised.",
    "unsoldBody": "The sale runs until all PPL is sold or for 24 months, whichever comes first. The term is fixed and will not be extended. After it ends, whatever was raised is split 50/50 between locked LP and the project multisig, and any unsold PPL on the curve goes to the community pool; there are no refunds outside sell-back. Until then, unsold PPL is held in the project multisig and the team does not touch it. Token curves on PEOPLE keep their own 180-day finalize rule for unsold tokens.",
    "salePublicTitle": "Published sale parameters",
    "salePublicBody": "Prices, limits and the curve formula are public on /buy. Purchases stay disabled until the sale hub contract is deployed; connecting a wallet does not commit you to anything.",
    "salePublicCta": "Open the /buy page",
    "saleCurveBullets": [
      "100,000,000 PPL on the curve (10% of supply); start $0.005, exponential rise, $0.25 cap on the curve only.",
      "Graduation at $4,000,000 raised. The sale runs until sold out or 24 months (fixed term), whichever comes first; there are no extensions, and unsold PPL goes to the Community Pool.",
      "Buying and selling on the curve works from the day the sale opens. The 1,000 verified people + multisig gate applies to PPL transfers / full mainnet, not to the sale opening.",
      "Raise split 50% locked liquidity / 50% project multisig; LP tokens locked 24 months.",
      "Sell-back: verified people only; each purchase lot must be held 30 days before it can be sold back; the sell-back price is the curve price at the moment of exit; global cap 2% of the reserve per day; personal cap $2,000 per person per day; fee 1.5% (3% when total sell-backs that day exceed 1% of the reserve); sell-back closes after graduation; payouts in USDC on Base."
    ],
    "curveTableSold": "% sold",
    "curveTablePrice": "Spot price (USDT)",
    "curveTableRaised": "Raised (USDT)"
  },
  "es": {
    "saleLead": "Hasta 100M PPL del tramo de venta (10% de la oferta fija) se venden en una curva exponencial pública. Los parámetros publicados coinciden con la página /buy y la API de pedidos.",
    "salePayBody": "La venta se realiza solo en Base (un contrato de venta en Base). Paga con USDC o USDT en Base, o con USDT/USDC desde otras cadenas, incluidas Tron y Solana, mediante el widget de intercambio automático integrado, que convierte a USDC en Base. TON no es compatible.",
    "curveLead": "Curva exponencial: el precio empieza en $0,005 por PPL y sube con cada compra, hasta un tope de $0,25 mientras la curva esté abierta. La graduación cierra la curva al reunir $4M.",
    "unsoldBody": "La venta dura hasta que se vendan todos los PPL o durante 24 meses, lo que ocurra primero. El plazo es fijo y no se prorrogará. Al terminar, lo recaudado se reparte 50/50 entre LP bloqueada y el multisig del proyecto, y cualquier PPL no vendido en la curva va al fondo comunitario; no hay reembolsos fuera de la venta de vuelta. Hasta entonces, los PPL no vendidos permanecen en el multisig del proyecto y el equipo no los toca. Las curvas de tokens en PEOPLE conservan su propia regla de cierre a los 180 días para lo no vendido.",
    "salePublicTitle": "Parámetros publicados de la venta",
    "salePublicBody": "Precios, límites y la fórmula de la curva son públicos en /buy. Las compras siguen desactivadas hasta desplegar el contrato hub de la venta; conectar la cartera no te compromete a nada.",
    "salePublicCta": "Abrir la página /buy",
    "saleCurveBullets": [
      "100.000.000 PPL en la curva (10% de la oferta); inicio $0,005, subida exponencial, tope $0,25 solo en la curva.",
      "Graduación al recaudar $4.000.000. La venta dura hasta agotar existencias o 24 meses (plazo fijo), lo que ocurra primero; no hay prórrogas y el PPL no vendido va al fondo comunitario.",
      "Comprar y vender en la curva funciona desde el día en que se abre la venta. La puerta de 1.000 personas verificadas + multisig se aplica a las transferencias de PPL / mainnet completo, no a la apertura de la venta.",
      "Recaudación 50% liquidez bloqueada / 50% multisig del proyecto; tokens LP bloqueados 24 meses.",
      "Venta de vuelta: solo personas verificadas; cada lote de compra debe mantenerse 30 días antes de poder venderse de vuelta; el precio de venta de vuelta es el precio de la curva en el momento de la salida; tope global del 2% de la reserva por día; tope personal de $2.000 por persona y día; comisión del 1,5% (3% cuando el total de ventas de vuelta del día supera el 1% de la reserva); la venta de vuelta se cierra tras la graduación; pagos en USDC en Base."
    ],
    "curveTableSold": "% vendido",
    "curveTablePrice": "Precio spot (USDT)",
    "curveTableRaised": "Recaudado (USDT)"
  },
  "pt": {
    "saleLead": "Até 100M PPL do lote de venda (10% da oferta fixa) são vendidos em uma curva exponencial pública. Os parâmetros publicados coincidem com a página /buy e a API de pedidos.",
    "salePayBody": "A venda ocorre apenas na Base (um contrato de venda na Base). Pague com USDC ou USDT na Base, ou com USDT/USDC de outras redes, incluindo Tron e Solana, pelo widget de swap automático integrado, que converte para USDC na Base. TON não é suportado.",
    "curveLead": "Curva exponencial: o preço começa em $0,005 por PPL e sobe a cada compra, até um teto de $0,25 enquanto a curva estiver aberta. A graduação fecha a curva ao arrecadar $4M.",
    "unsoldBody": "A venda segue até vender todo o PPL ou por 24 meses, o que vier primeiro. O prazo é fixo e não será prorrogado. Ao terminar, o arrecadado é dividido 50/50 entre LP bloqueada e o multisig do projeto, e qualquer PPL não vendido na curva vai para o fundo comunitário; não há reembolsos fora da revenda. Até então, PPL não vendido fica no multisig do projeto e a equipe não o toca. Curvas de tokens na PEOPLE mantêm a própria regra de finalização em 180 dias para o não vendido.",
    "salePublicTitle": "Parâmetros publicados da venda",
    "salePublicBody": "Preços, limites e a fórmula da curva são públicos em /buy. Compras permanecem desativadas até o contrato hub da venda ser implantado; conectar a carteira não te compromete com nada.",
    "salePublicCta": "Abrir a página /buy",
    "saleCurveBullets": [
      "100.000.000 PPL na curva (10% da oferta); início $0,005, alta exponencial, teto $0,25 só na curva.",
      "Graduação ao arrecadar $4.000.000. A venda segue até esgotar ou por 24 meses (prazo fixo), o que vier primeiro; sem prorrogações, e o PPL não vendido vai para o fundo comunitário.",
      "Comprar e vender na curva funciona desde o dia em que a venda abre. O requisito de 1.000 pessoas verificadas + multisig se aplica às transferências de PPL / mainnet completo, não à abertura da venda.",
      "Arrecadação 50% liquidez bloqueada / 50% multisig do projeto; tokens LP bloqueados por 24 meses.",
      "Revenda: apenas pessoas verificadas; cada lote de compra deve ser mantido por 30 dias antes de poder ser revendido; o preço de revenda é o preço da curva no momento da saída; limite global de 2% da reserva por dia; limite pessoal de $2.000 por pessoa por dia; taxa de 1,5% (3% quando o total de revendas do dia excede 1% da reserva); a revenda encerra após a graduação; pagamentos em USDC na Base."
    ],
    "curveTableSold": "% vendido",
    "curveTablePrice": "Preço spot (USDT)",
    "curveTableRaised": "Arrecadado (USDT)"
  },
  "fr": {
    "saleLead": "Jusqu'à 100M PPL du lot de vente (10 % de l'offre fixe) sont vendus sur une courbe exponentielle publique. Les paramètres publiés correspondent à la page /buy et à l'API de commandes.",
    "salePayBody": "La vente a lieu uniquement sur Base (un seul contrat de vente sur Base). Payez en USDC ou USDT sur Base, ou en USDT/USDC depuis d'autres chaînes, y compris Tron et Solana, via le widget d'échange automatique intégré, qui convertit en USDC sur Base. TON n'est pas pris en charge.",
    "curveLead": "Courbe exponentielle : le prix démarre à 0,005 $ par PPL et monte à chaque achat, jusqu'à un plafond de 0,25 $ tant que la courbe est ouverte. La graduation ferme la courbe à 4 M$ levés.",
    "unsoldBody": "La vente dure jusqu'à ce que tous les PPL soient vendus ou pendant 24 mois, selon la première échéance. Le délai est fixe et ne sera pas prolongé. À la fin, les fonds levés sont partagés 50/50 entre LP verrouillée et multisig du projet, et tout PPL invendu sur la courbe va au fonds communautaire ; aucun remboursement en dehors de la revente. D'ici là, les PPL invendus sont détenus par le multisig du projet et l'équipe n'y touche pas. Les courbes de jetons sur PEOPLE gardent leur propre règle de finalisation à 180 jours pour l'invendu.",
    "salePublicTitle": "Paramètres de vente publiés",
    "salePublicBody": "Prix, limites et formule de la courbe sont publics sur /buy. Les achats restent désactivés tant que le contrat hub de vente n'est pas déployé ; connecter un portefeuille ne vous engage à rien.",
    "salePublicCta": "Ouvrir la page /buy",
    "saleCurveBullets": [
      "100 000 000 PPL sur la courbe (10 % de l'offre) ; départ 0,005 $, hausse exponentielle, plafond 0,25 $ sur la courbe seulement.",
      "Graduation à 4 000 000 $ levés. La vente dure jusqu'à épuisement ou pendant 24 mois (durée fixe), selon la première échéance ; aucune prolongation, et les PPL invendus vont au fonds communautaire.",
      "L'achat et la vente sur la courbe fonctionnent dès l'ouverture de la vente. Le seuil de 1 000 personnes vérifiées + multisig s'applique aux transferts de PPL / au mainnet complet, pas à l'ouverture de la vente.",
      "Levée 50 % liquidité verrouillée / 50 % multisig projet ; jetons LP verrouillés 24 mois.",
      "Revente : personnes vérifiées uniquement ; chaque lot d'achat doit être conservé 30 jours avant de pouvoir être revendu ; le prix de revente est le prix de la courbe au moment de la sortie ; plafond global de 2 % de la réserve par jour ; plafond personnel de 2 000 $ par personne et par jour ; frais de 1,5 % (3 % lorsque le total des reventes du jour dépasse 1 % de la réserve) ; la revente ferme après la graduation ; paiements en USDC sur Base."
    ],
    "curveTableSold": "% vendu",
    "curveTablePrice": "Prix spot (USDT)",
    "curveTableRaised": "Levé (USDT)"
  },
  "de": {
    "saleLead": "Bis zu 100M PPL aus dem Verkaufsbudget (10 % des festen Angebots) werden auf einer öffentlichen Exponentialkurve verkauft. Veröffentlichte Parameter entsprechen der Live-Seite /buy und der Order-API.",
    "salePayBody": "Der Verkauf läuft nur auf Base (ein Verkaufsvertrag auf Base). Bezahle mit USDC oder USDT auf Base oder mit USDT/USDC von anderen Chains, einschließlich Tron und Solana, über das integrierte automatische Swap-Widget, das in USDC auf Base umwandelt. TON wird nicht unterstützt.",
    "curveLead": "Exponentialkurve: Der Preis startet bei 0,005 $ pro PPL und steigt mit jedem Kauf bis zu einer Obergrenze von 0,25 $, solange die Kurve offen ist. Graduation schließt die Kurve bei 4 M$ Einnahmen.",
    "unsoldBody": "Der Verkauf läuft, bis alle PPL verkauft sind oder 24 Monate vergangen sind — je nachdem, was zuerst eintritt. Die Laufzeit ist fest und wird nicht verlängert. Danach wird das Eingenommene 50/50 zwischen gesperrter LP und Projekt-Multisig geteilt; nicht verkaufte PPL auf der Kurve gehen in den Community-Pool; keine Erstattungen außerhalb des Rückverkaufs. Bis dahin liegen unverkaufte PPL im Projekt-Multisig, das Team greift nicht zu. Token-Kurven auf PEOPLE behalten ihre eigene 180-Tage-Finalisierungsregel für Unverkauftes.",
    "salePublicTitle": "Veröffentlichte Verkaufsparameter",
    "salePublicBody": "Preise, Limits und Kurvenformel sind öffentlich auf /buy. Käufe bleiben deaktiviert, bis der Sale-Hub-Vertrag deployed ist; Wallet verbinden verpflichtet zu nichts.",
    "salePublicCta": "Seite /buy öffnen",
    "saleCurveBullets": [
      "100.000.000 PPL auf der Kurve (10 % des Angebots); Start 0,005 $, exponentieller Anstieg, Deckel 0,25 $ nur auf der Kurve.",
      "Graduation bei 4.000.000 $ eingesammelt. Der Verkauf läuft bis zum Ausverkauf oder 24 Monate (feste Laufzeit), je nachdem, was zuerst eintritt; keine Verlängerungen, und nicht verkaufte PPL gehen in den Community-Pool.",
      "Kaufen und Verkaufen auf der Kurve funktioniert ab dem Tag der Verkaufseröffnung. Das Gate von 1.000 verifizierten Personen + Multisig gilt für PPL-Transfers / vollständiges Mainnet, nicht für die Verkaufseröffnung.",
      "Einnahmen 50 % gesperrte Liquidität / 50 % Projekt-Multisig; LP-Tokens 24 Monate gesperrt.",
      "Rückverkauf: nur verifizierte Personen; jedes Kauflos muss 30 Tage gehalten werden, bevor es zurückverkauft werden kann; der Rückverkaufspreis ist der Kurvenpreis im Moment des Ausstiegs; globales Limit 2 % der Reserve pro Tag; persönliches Limit 2.000 $ pro Person und Tag; Gebühr 1,5 % (3 %, wenn die gesamten Rückverkäufe an diesem Tag 1 % der Reserve übersteigen); Rückverkauf endet nach der Graduation; Auszahlungen in USDC auf Base."
    ],
    "curveTableSold": "% verkauft",
    "curveTablePrice": "Spotpreis (USDT)",
    "curveTableRaised": "Eingenommen (USDT)"
  },
  "it": {
    "saleLead": "Fino a 100M PPL dal lotto di vendita (10% dell'offerta fissa) vengono venduti su una curva esponenziale pubblica. I parametri pubblicati coincidono con la pagina /buy e l'API ordini.",
    "salePayBody": "La vendita avviene solo su Base (un contratto di vendita su Base). Paga con USDC o USDT su Base, oppure con USDT/USDC da altre chain, incluse Tron e Solana, tramite il widget di swap automatico integrato, che converte in USDC su Base. TON non è supportato.",
    "curveLead": "Curva esponenziale: il prezzo parte da $0,005 per PPL e sale a ogni acquisto, fino a un tetto di $0,25 mentre la curva è aperta. La graduation chiude la curva a $4M raccolti.",
    "unsoldBody": "La vendita dura finché non si vendono tutti i PPL o per 24 mesi, a seconda di cosa avviene prima. Il termine è fisso e non sarà prorogato. Alla fine, quanto raccolto è diviso 50/50 tra LP bloccata e multisig del progetto; ogni PPL non venduto sulla curva va al fondo community; nessun rimborso al di fuori della rivendita. Fino ad allora i PPL non venduti restano nel multisig del progetto e il team non li tocca. Le curve dei token su PEOPLE mantengono la propria regola di finalizzazione a 180 giorni per l'invenduto.",
    "salePublicTitle": "Parametri di vendita pubblicati",
    "salePublicBody": "Prezzi, limiti e formula della curva sono pubblici su /buy. Gli acquisti restano disabilitati finché non è deployato il contratto hub della vendita; connettere il wallet non impegna a nulla.",
    "salePublicCta": "Apri la pagina /buy",
    "saleCurveBullets": [
      "100.000.000 PPL sulla curva (10% dell'offerta); partenza $0,005, crescita esponenziale, tetto $0,25 solo sulla curva.",
      "Graduation a 4.000.000 $ raccolti. La vendita dura fino a esaurimento o per 24 mesi (termine fisso), a seconda di cosa avviene prima; nessuna proroga e i PPL invenduti vanno al fondo community.",
      "Comprare e vendere sulla curva funziona dal giorno in cui si apre la vendita. Il requisito di 1.000 persone verificate + multisig si applica ai trasferimenti PPL / mainnet completo, non all'apertura della vendita.",
      "Raccolta 50% liquidità bloccata / 50% multisig progetto; token LP bloccati 24 mesi.",
      "Rivendita: solo persone verificate; ogni lotto di acquisto deve essere detenuto 30 giorni prima di poter essere rivenduto; il prezzo di rivendita è il prezzo della curva al momento dell'uscita; tetto globale del 2% della riserva al giorno; tetto personale di 2.000 $ per persona al giorno; commissione 1,5% (3% quando il totale delle rivendite del giorno supera l'1% della riserva); la rivendita chiude dopo la graduation; pagamenti in USDC su Base."
    ],
    "curveTableSold": "% venduto",
    "curveTablePrice": "Prezzo spot (USDT)",
    "curveTableRaised": "Raccolto (USDT)"
  },
  "tr": {
    "saleLead": "Satış havuzundaki 100M PPL'ye kadar (%10 sabit arz) halka açık üstel eğri üzerinde satılır. Yayınlanan parametreler canlı /buy sayfası ve sipariş API'si ile uyumludur.",
    "salePayBody": "Satış yalnızca Base üzerinde yürür (Base'de tek bir satış sözleşmesi). Base'de USDC veya USDT ile ya da Tron ve Solana dahil diğer zincirlerden USDT/USDC ile yerleşik otomatik takas widget'ı üzerinden ödeyin; widget bunları Base'de USDC'ye çevirir. TON desteklenmez.",
    "curveLead": "Üstel eğri: fiyat PPL başına $0,005'ten başlar ve eğri açıkken her alımla $0,25 tavanına kadar yükselir. Mezuniyet eğriyi $4M toplanınca kapatır.",
    "unsoldBody": "Satış, tüm PPL satılana veya 24 ay dolana kadar — hangisi önce gelirse — sürer. Süre sabittir ve uzatılmaz. Bittiğinde toplanan tutar %50 kilitli LP / %50 proje multisig arasında bölünür; eğrida satılmayan PPL topluluk havuzuna gider; geri satış dışında iade yoktur. O zamana kadar satılmayan PPL proje multisig'inde tutulur, ekip dokunmaz. PEOPLE'daki token eğrileri satılmayan için kendi 180 günlük finalize kuralını korur.",
    "salePublicTitle": "Yayınlanan satış parametreleri",
    "salePublicBody": "Fiyatlar, limitler ve eğri formülü /buy'da herkese açıktır. Satış hub sözleşmesi deploy edilene kadar alımlar kapalıdır; cüzdan bağlamak sizi hiçbir şeye bağlamaz.",
    "salePublicCta": "/buy sayfasını aç",
    "saleCurveBullets": [
      "Eğrida 100.000.000 PPL (arzın %10'u); başlangıç $0,005, üstel artış, yalnızca eğrida $0,25 tavan.",
      "$4.000.000 toplanınca mezuniyet. Satış tükenene veya 24 aya kadar (sabit süre), hangisi önce gelirse sürer; uzatma yoktur ve satılmayan PPL topluluk havuzuna gider.",
      "Eğrida alım satım, satış açıldığı günden itibaren çalışır. 1.000 doğrulanmış kişi + multisig koşulu PPL transferlerine / tam mainnet'e uygulanır, satışın açılışına değil.",
      "Toplanan %50 kilitli likidite / %50 proje multisig; LP tokenları 24 ay kilitli.",
      "Geri satış: yalnızca doğrulanmış kişiler; her alım lotu geri satılmadan önce 30 gün tutulmalıdır; geri satış fiyatı çıkış anındaki eğri fiyatıdır; günlük rezervin %2'si küresel üst sınırı; kişi başına günde $2.000 kişisel üst sınırı; ücret %1,5 (gün içindeki toplam geri satışlar rezervin %1'ini aştığında %3); geri satış mezuniyetten sonra kapanır; ödemeler Base'de USDC olarak yapılır."
    ],
    "curveTableSold": "% satıldı",
    "curveTablePrice": "Spot fiyat (USDT)",
    "curveTableRaised": "Toplanan (USDT)"
  },
  "vi": {
    "saleLead": "Tối đa 100M PPL từ phần bán (10% cung cố định) được bán trên đường cong mũ công khai. Tham số công bố khớp trang /buy trực tiếp và API đặt hàng.",
    "salePayBody": "Đợt bán chỉ diễn ra trên Base (một hợp đồng bán trên Base). Thanh toán bằng USDC hoặc USDT trên Base, hoặc bằng USDT/USDC từ các chuỗi khác, bao gồm Tron và Solana, qua widget hoán đổi tự động tích hợp, công cụ này chuyển thành USDC trên Base. TON không được hỗ trợ.",
    "curveLead": "Đường cong mũ: giá bắt đầu $0,005 mỗi PPL và tăng theo mỗi lần mua, tới trần $0,25 khi đường cong mở. Tốt nghiệp đóng đường cong ở mức gom $4M.",
    "unsoldBody": "Đợt bán chạy đến khi bán hết PPL hoặc trong 24 tháng, tùy điều kiện nào đến trước. Thời hạn cố định và không gia hạn. Khi kết thúc, số tiền gom được chia 50/50 giữa LP khóa và multisig dự án; PPL chưa bán trên đường cong vào quỹ cộng đồng; không hoàn tiền ngoài bán lại. Trước đó PPL chưa bán được giữ trong multisig dự án, đội ngũ không chạm vào. Đường cong token trên PEOPLE giữ quy tắc finalize 180 ngày riêng cho phần chưa bán.",
    "salePublicTitle": "Tham số bán hàng đã công bố",
    "salePublicBody": "Giá, giới hạn và công thức đường cong công khai trên /buy. Mua hàng vẫn tắt cho đến khi hub hợp đồng bán được triển khai; kết nối ví không ràng buộc gì.",
    "salePublicCta": "Mở trang /buy",
    "saleCurveBullets": [
      "100.000.000 PPL trên đường cong (10% cung); bắt đầu $0,005, tăng mũ, trần $0,25 chỉ trên đường cong.",
      "Tốt nghiệp khi gom $4.000.000. Đợt bán chạy đến khi bán hết hoặc trong 24 tháng (thời hạn cố định), tùy điều kiện nào đến trước; không gia hạn, và PPL chưa bán vào quỹ cộng đồng.",
      "Mua và bán trên đường cong hoạt động từ ngày đợt bán mở. Cổng 1.000 người đã xác minh + multisig áp dụng cho chuyển PPL / mainnet đầy đủ, không áp dụng cho ngày mở bán.",
      "Gom 50% thanh khoản khóa / 50% multisig dự án; token LP khóa 24 tháng.",
      "Bán lại: chỉ người đã xác minh; mỗi lô mua phải được giữ 30 ngày trước khi có thể bán lại; giá bán lại là giá đường cong tại thời điểm thoát; giới hạn toàn cầu 2% dự trữ mỗi ngày; giới hạn cá nhân $2.000 mỗi người mỗi ngày; phí 1,5% (3% khi tổng bán lại trong ngày vượt 1% dự trữ); bán lại đóng sau khi tốt nghiệp; thanh toán bằng USDC trên Base."
    ],
    "curveTableSold": "% đã bán",
    "curveTablePrice": "Giá spot (USDT)",
    "curveTableRaised": "Đã gom (USDT)"
  },
  "id": {
    "saleLead": "Hingga 100M PPL dari bagian penjualan (10% pasokan tetap) dijual pada kurva eksponensial publik. Parameter yang dipublikasikan selaras dengan halaman /buy langsung dan API pesanan.",
    "salePayBody": "Penjualan hanya berjalan di Base (satu kontrak penjualan di Base). Bayar dengan USDC atau USDT di Base, atau dengan USDT/USDC dari chain lain, termasuk Tron dan Solana, melalui widget swap otomatis bawaan, yang mengonversinya ke USDC di Base. TON tidak didukung.",
    "curveLead": "Kurva eksponensial: harga mulai $0,005 per PPL dan naik setiap pembelian, hingga batas $0,25 selama kurva terbuka. Graduation menutup kurva saat terkumpul $4M.",
    "unsoldBody": "Penjualan berjalan sampai semua PPL terjual atau selama 24 bulan, mana yang lebih dulu. Jangka waktu tetap dan tidak akan diperpanjang. Setelah berakhir, dana terkumpul dibagi 50/50 antara LP terkunci dan multisig proyek; PPL tidak terjual di kurva masuk ke kolam komunitas; tidak ada pengembalian dana di luar jual kembali. Sampai saat itu PPL tidak terjual disimpan di multisig proyek dan tim tidak menyentuhnya. Kurva token di PEOPLE mempertahankan aturan finalisasi 180 hari sendiri untuk yang tidak terjual.",
    "salePublicTitle": "Parameter penjualan yang dipublikasikan",
    "salePublicBody": "Harga, batas, dan rumus kurva publik di /buy. Pembelian tetap nonaktif sampai kontrak hub penjualan di-deploy; menghubungkan dompet tidak mengikat Anda.",
    "salePublicCta": "Buka halaman /buy",
    "saleCurveBullets": [
      "100.000.000 PPL di kurva (10% pasokan); awal $0,005, kenaikan eksponensial, batas $0,25 hanya di kurva.",
      "Graduasi saat $4.000.000 terkumpul. Penjualan berjalan sampai habis atau 24 bulan (jangka waktu tetap), mana yang lebih dulu; tidak ada perpanjangan, dan PPL yang tidak terjual masuk ke kolam komunitas.",
      "Membeli dan menjual di kurva berjalan sejak hari penjualan dibuka. Gerbang 1.000 orang terverifikasi + multisig berlaku untuk transfer PPL / mainnet penuh, bukan untuk pembukaan penjualan.",
      "Dana 50% likuiditas terkunci / 50% multisig proyek; token LP terkunci 24 bulan.",
      "Jual kembali: hanya orang terverifikasi; setiap lot pembelian harus ditahan 30 hari sebelum dapat dijual kembali; harga jual kembali adalah harga kurva saat keluar; batas global 2% dari cadangan per hari; batas pribadi $2.000 per orang per hari; biaya 1,5% (3% ketika total jual kembali hari itu melebihi 1% dari cadangan); jual kembali ditutup setelah graduasi; pembayaran dalam USDC di Base."
    ],
    "curveTableSold": "% terjual",
    "curveTablePrice": "Harga spot (USDT)",
    "curveTableRaised": "Terkumpul (USDT)"
  },
  "zh": {
    "saleLead": "销售池中最多 100M PPL（固定供应的 10%）在公开指数曲线上出售。已公布参数与线上 /buy 页面及订单 API 一致。",
    "salePayBody": "销售仅在 Base 上进行（Base 上只有一个销售合约）。在 Base 上使用 USDC 或 USDT 支付，或通过内置自动兑换组件使用来自其他链（包括 Tron 和 Solana）的 USDT/USDC 支付，该组件会将其转换为 Base 上的 USDC。不支持 TON。",
    "curveLead": "指数曲线：价格从每 PPL $0.005 起，随每次购买上升，曲线开放期间最高 $0.25。达到 $400 万募集额时毕业并关闭曲线。",
    "unsoldBody": "销售持续至全部 PPL 售完或满 24 个月，以先到者为准。期限固定，不会延长。结束后，已募资金按 50/50 分配至锁定 LP 与项目多签，曲线上未售出的 PPL 进入社区池；卖回之外不退款。此前未售出的 PPL 由项目多签保管，团队不动用。PEOPLE 上的代币曲线对未售出部分仍适用各自的 180 天 finalize 规则。",
    "salePublicTitle": "已公布的销售参数",
    "salePublicBody": "价格、限额与曲线公式在 /buy 公开。销售 hub 合约部署前购买保持关闭；连接钱包不构成任何承诺。",
    "salePublicCta": "打开 /buy 页面",
    "saleCurveBullets": [
      "曲线上 100,000,000 PPL（供应 10%）；起始 $0.005，指数上升，仅曲线上限 $0.25。",
      "募集 $4,000,000 时毕业。销售持续至售罄或满 24 个月（固定期限），以先到者为准；不延长，未售出的 PPL 进入社区池。",
      "曲线上的买卖从销售开放之日起即可进行。1,000 名已验证用户 + 多签门槛适用于 PPL 转账 / 完整主网，不适用于销售开放。",
      "募集 50% 锁定流动性 / 50% 项目多签；LP 代币锁定 24 个月。",
      "卖回：仅限已验证用户；每个购买批次必须持有 30 天才能卖回；卖回价格为退出时的曲线价格；每日全球上限为储备的 2%；每人每日个人上限为 $2,000；费用 1.5%（当日卖回总额超过储备的 1% 时为 3%）；毕业后卖回关闭；在 Base 上以 USDC 支付。"
    ],
    "curveTableSold": "% 已售",
    "curveTablePrice": "现货价 (USDT)",
    "curveTableRaised": "已募集 (USDT)"
  },
  "ar": {
    "saleLead": "حتى 100M PPL من حصة البيع (10% من العرض الثابت) تُباع على منحنى أسي علني. المعلمات المنشورة تطابق صفحة /buy المباشرة وواجهة الطلبات.",
    "salePayBody": "يتم البيع على Base فقط (عقد بيع واحد على Base). ادفع بـ USDC أو USDT على Base، أو بـ USDT/USDC من شبكات أخرى، بما في ذلك Tron وSolana، عبر أداة المبادلة التلقائية المدمجة، التي تحوّلها إلى USDC على Base. TON غير مدعوم.",
    "curveLead": "منحنى أسي: السعر يبدأ عند 0.005$ لكل PPL ويرتفع مع كل شراء، حتى سقف 0.25$ ما دام المنحنى مفتوحًا. التخرج يغلق المنحنى عند جمع 4M$.",
    "unsoldBody": "يستمر البيع حتى بيع كل PPL أو لمدة 24 شهرًا، أيهما أسبق. المدة ثابتة ولن تُمدَّد. بعد الانتهاء يُقسَّم المجموع 50/50 بين LP مقفلة وmultisig المشروع، وأي PPL غير مباع على المنحنى يذهب إلى صندوق المجتمع؛ لا استرداد خارج إعادة البيع. حتى ذلك الحين يُحتفظ بـ PPL غير المباع في multisig المشروع ولا يمسه الفريق. منحنيات الرموز على PEOPLE تحتفظ بقاعدة الإنهاء بعد 180 يومًا الخاصة بها لغير المباع.",
    "salePublicTitle": "معلمات البيع المنشورة",
    "salePublicBody": "الأسعار والحدود وصيغة المنحنى علنية على /buy. الشراء معطّل حتى نشر عقد hub البيع؛ ربط المحفظة لا يلزمك بشيء.",
    "salePublicCta": "افتح صفحة /buy",
    "saleCurveBullets": [
      "100,000,000 PPL على المنحنى (10% من العرض)؛ بداية 0.005$، ارتفاع أسي، سقف 0.25$ على المنحنى فقط.",
      "التخرج عند جمع $4,000,000. يستمر البيع حتى نفاد الكمية أو 24 شهرًا (مدة ثابتة)، أيهما أسبق؛ لا تمديد، وPPL غير المباع يذهب إلى صندوق المجتمع.",
      "الشراء والبيع على المنحنى يعملان من يوم فتح البيع. شرط 1,000 شخص موثّق + multisig ينطبق على تحويلات PPL / mainnet الكامل، لا على فتح البيع.",
      "المجموع 50% سيولة مقفلة / 50% multisig المشروع؛ رموز LP مقفلة 24 شهرًا.",
      "إعادة البيع: للأشخاص الموثّقين فقط؛ يجب الاحتفاظ بكل دفعة شراء 30 يومًا قبل إمكانية إعادة بيعها؛ سعر إعادة البيع هو سعر المنحنى لحظة الخروج؛ سقف عالمي 2% من الاحتياطي يوميًا؛ سقف شخصي $2,000 لكل شخص يوميًا؛ رسوم 1.5% (3% عندما يتجاوز إجمالي عمليات إعادة البيع في اليوم 1% من الاحتياطي)؛ تُغلق إعادة البيع بعد التخرج؛ الدفع بـ USDC على Base."
    ],
    "curveTableSold": "% مباع",
    "curveTablePrice": "السعر الفوري (USDT)",
    "curveTableRaised": "المجموع (USDT)"
  },
  "ru": {
    "saleLead": "До 100M PPL из корзины продажи (10% фиксированной эмиссии) продаются на публичной экспоненциальной кривой. Параметры совпадают со страницей /buy и API заказов.",
    "salePayBody": "Продажа идёт только на Base (один контракт продажи на Base). Платите USDC или USDT на Base либо USDT/USDC из других сетей, включая Tron и Solana, через встроенный автоматический своп-виджет, который конвертирует их в USDC на Base. TON не поддерживается.",
    "curveLead": "Экспоненциальная кривая: цена стартует с $0.005 за PPL и растёт с каждой покупкой, до потолка $0.25, пока кривая открыта. Выпуск закрывается при сборе $4M.",
    "unsoldBody": "Продажа идёт, пока не распроданы все PPL или не истекут 24 месяца — что наступит раньше. Срок фиксирован и не продлевается. После окончания собранное делится 50/50 между заблокированной LP и мультисигом проекта, непроданные PPL на кривой уходят в пул сообщества; возвратов вне обратного выкупа нет. До этого непроданные PPL хранятся в мультисиге проекта, команда их не трогает. У кривых токенов на PEOPLE остаётся своё правило финализации через 180 дней для непроданного остатка.",
    "salePublicTitle": "Опубликованные параметры продажи",
    "salePublicBody": "Цены, лимиты и формула кривой публичны на /buy. Покупка отключена, пока не развёрнут hub-контракт продажи; подключение кошелька ни к чему не обязывает.",
    "salePublicCta": "Открыть страницу /buy",
    "saleCurveBullets": [
      "100 000 000 PPL на кривой (10% эмиссии); старт $0.005, экспоненциальный рост, потолок $0.25 только на кривой.",
      "Выпуск при $4 000 000 собранных. Продажа идёт до полной распродажи или 24 месяцев (фиксированный срок), что наступит раньше; продлений нет, непроданные PPL уходят в пул сообщества.",
      "Покупка и продажа на кривой работают с дня открытия продажи. Порог в 1 000 верифицированных людей и мультисиг относится к переводам PPL / полному mainnet, а не к открытию продажи.",
      "Сбор 50% в заблокированную ликвидность / 50% в мультисиг проекта; LP заблокированы на 24 месяца.",
      "Обратный выкуп: только верифицированные люди; каждый лот покупки должен быть удержан 30 дней до обратного выкупа; цена обратного выкупа — цена кривой в момент выхода; глобальный лимит 2% резерва в день; личный лимит $2 000 на человека в день; комиссия 1,5% (3%, когда общий объём обратных выкупов за день превышает 1% резерва); обратный выкуп закрывается после выпуска; выплаты в USDC на Base."
    ],
    "curveTableSold": "% продано",
    "curveTablePrice": "Спот-цена (USDT)",
    "curveTableRaised": "Собрано (USDT)"
  }
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
