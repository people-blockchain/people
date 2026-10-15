#!/usr/bin/env node
/**
 * Patch litepaper markdown + chart JSON for public PPL sale (reverses P0-10 hiding).
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mdDir = join(root, "src/content/litepaper");
const surfaces = join(root, "src/lib/locales/surfaces");

const roadmapEn =
  "| **Mainnet + PPL sale** | Mainnet launches. Published sale parameters (exponential curve from **$0.005** per PPL, up to **100M PPL** on the curve, **$4M** graduation) are on `/buy`; purchases stay disabled until the sale hub contract is deployed. | At least 1,000 verified people **and** a live treasury multisig |";

const regulationEn =
  "- **Regulation.** Rules differ by country and may change. Published PPL sale parameters are on `/buy` (curve from **$0.005** per PPL); purchases stay disabled until the sale hub contract is deployed. No KYC or sale-eligibility checks run on this site.";

const changelogEn =
  "- The **PPL community sale** uses the published exponential curve on `/buy` (starts at **$0.005** per PPL; prices and limits are public; the buy action stays off until the hub contract is deployed). No KYC or sale-eligibility checks are run on this site.";

const patches = {
  en: {
    roadmapOld:
      "| **Mainnet + PPL sale** | Mainnet launches. The PPL sale is not open yet; it will only open once an operating legal entity exists. | At least 1,000 verified people **and** a live treasury multisig |",
    roadmapNew: roadmapEn,
    regulationOld:
      "- **Regulation.** Rules differ by country and may change. Published PPL sale parameters are on `/buy`; purchases stay disabled until the sale hub contract is deployed. No KYC or sale-eligibility checks run on this site.",
    regulationNew: regulationEn,
    changelogOld:
      "- The **PPL community sale** uses the published exponential curve on `/buy` (prices and limits are public; the buy action stays off until the hub contract is deployed). No KYC or sale-eligibility checks are run on this site.",
    changelogNew: changelogEn,
  },
  ru: {
    roadmapOld:
      "| **Мейннет + продажа PPL** | Мейннет запускается. Продажа PPL пока не открыта; она откроется только после создания юрлица-оператора. | По крайней мере 1,000 верифицированных людей **и** живая мултисигнатура казны |",
    roadmapNew:
      "| **Мейннет + продажа PPL** | Запускается mainnet. Опубликованные параметры продажи (экспоненциальная кривая от **$0.005** за PPL, до **100M PPL** на кривой, graduation при **$4M**) на `/buy`; покупки отключены, пока не развёрнут hub-контракт продажи. | По крайней мере 1 000 verified people **и** живая мультисиг казны |",
    regulationOld:
      "- **Регулирование.** Правила отличаются в зависимости от страны и могут измениться. Публичной продажи PPL сейчас нет; проверки KYC не проводятся.",
    regulationNew:
      "- **Регулирование.** Правила зависят от страны и могут меняться. Параметры продажи PPL опубликованы на `/buy` (кривая от **$0.005** за PPL); покупки отключены, пока не развёрнут hub-контракт. KYC и проверки допустимости на сайте не проводятся.",
    changelogOld:
      "- **Публичной продажи PPL сейчас нет**, проверки KYC и допустимости участия не проводятся.",
    changelogNew:
      "- **Продажа PPL сообществу** — опубликованная экспоненциальная кривая на `/buy` (старт **$0.005** за PPL; цены и лимиты публичны; покупка отключена до развёртывания hub). KYC и проверки допустимости на сайте не проводятся.",
  },
  es: {
    roadmapOld:
      "| **Mainnet + venta de PPL** | Se lanza mainnet. La venta de PPL aún no está abierta; solo abrirá cuando exista una entidad legal operadora. | Al menos 1.000 personas verificadas **y** una multifirma de tesorería activa |",
    roadmapNew:
      "| **Mainnet + venta de PPL** | Se lanza mainnet. Los parámetros publicados (curva exponencial desde **$0.005** por PPL, hasta **100M PPL** en la curva, graduación en **$4M**) están en `/buy`; las compras siguen desactivadas hasta desplegar el hub de venta. | Al menos 1.000 personas verificadas **y** una multifirma de tesorería activa |",
    regulationOld:
      "- **Regulación.** Las reglas difieren según el país y pueden cambiar. No hay venta pública de PPL en este momento; no se realizan comprobaciones de KYC.",
    regulationNew:
      "- **Regulación.** Las reglas varían por país y pueden cambiar. Los parámetros de venta de PPL están en `/buy` (curva desde **$0.005** por PPL); las compras siguen desactivadas hasta desplegar el hub. No hay KYC ni comprobaciones de elegibilidad en este sitio.",
    changelogOld:
      "- **No hay venta pública de PPL en este momento** y no se realizan comprobaciones de KYC ni de elegibilidad.",
    changelogNew:
      "- La **venta comunitaria de PPL** usa la curva exponencial publicada en `/buy` (inicio **$0.005** por PPL; precios y límites públicos; la compra sigue desactivada hasta el hub). No hay KYC ni comprobaciones de elegibilidad en este sitio.",
  },
  pt: {
    roadmapOld: null,
    roadmapNew:
      "| **Mainnet + venda de PPL** | O mainnet é lançado. Os parâmetros publicados (curva exponencial a partir de **$0.005** por PPL, até **100M PPL** na curva, graduação em **$4M**) estão em `/buy`; compras permanecem desativadas até o hub de venda ser implantado. | Pelo menos 1.000 pessoas verificadas **e** multisig do tesouro ativo |",
    regulationOld:
      "- **Regulação.** As regras diferem por país e podem mudar. Não há venda pública de PPL neste momento; não são feitas verificações de KYC.",
    regulationNew:
      "- **Regulação.** As regras variam por país e podem mudar. Os parâmetros da venda de PPL estão em `/buy` (curva a partir de **$0.005** por PPL); compras permanecem desativadas até o hub ser implantado. Não há KYC nem verificações de elegibilidade neste site.",
    changelogOld:
      "- **Não há venda pública de PPL no momento** e não são feitas verificações de KYC ou de elegibilidade.",
    changelogNew:
      "- A **venda comunitária de PPL** usa a curva exponencial publicada em `/buy` (início **$0.005** por PPL; preços e limites públicos; compra desativada até o hub). Não há KYC nem verificações de elegibilidade neste site.",
  },
  fr: {
    roadmapOld:
      "| **Mainnet + Vente PPL** | Mainnet est lancé. La vente PPL n'est pas encore ouverte ; elle n'ouvrira qu'une fois qu'une entité juridique opératrice existera. | Au moins 1 000 personnes vérifiées **et** un multisig de trésor en direct |",
    roadmapNew:
      "| **Mainnet + vente PPL** | Mainnet est lancé. Les paramètres publiés (courbe exponentielle dès **0,005 $** par PPL, jusqu'à **100M PPL** sur la courbe, graduation à **4 M$**) sont sur `/buy` ; les achats restent désactivés tant que le hub de vente n'est pas déployé. | Au moins 1 000 personnes vérifiées **et** un multisig de trésor actif |",
    regulationOld:
      "- **Réglementation.** Les règles diffèrent selon les pays et peuvent changer. Il n'y a pas de vente publique de PPL pour le moment ; aucun contrôle KYC n'est effectué.",
    regulationNew:
      "- **Réglementation.** Les règles varient selon le pays et peuvent changer. Les paramètres de vente PPL sont sur `/buy` (courbe dès **0,005 $** par PPL) ; les achats restent désactivés tant que le hub n'est pas déployé. Aucun KYC ni contrôle d'éligibilité sur ce site.",
    changelogOld:
      "- **Il n'y a pas de vente publique de PPL pour le moment** et aucun contrôle KYC ou d'éligibilité n'est effectué.",
    changelogNew:
      "- La **vente communautaire de PPL** suit la courbe exponentielle publiée sur `/buy` (départ **0,005 $** par PPL ; prix et limites publics ; achat désactivé jusqu'au hub). Aucun KYC ni contrôle d'éligibilité sur ce site.",
  },
  de: {
    regulationOld:
      "- **Regulierung.** Die Regeln unterscheiden sich je nach Land und können sich ändern. Derzeit gibt es keinen öffentlichen PPL-Sale; es werden keine KYC-Prüfungen durchgeführt.",
    regulationNew:
      "- **Regulierung.** Die Regeln variieren je nach Land und können sich ändern. Die PPL-Verkaufsparameter stehen auf `/buy` (Kurve ab **0,005 $** pro PPL); Käufe bleiben deaktiviert, bis der Sale-Hub deployed ist. Kein KYC und keine Teilnahmeprüfungen auf dieser Website.",
    changelogOld:
      "- **Derzeit gibt es keinen öffentlichen PPL-Sale**, und es werden keine KYC- oder Teilnahmeberechtigungsprüfungen durchgeführt.",
    changelogNew:
      "- Der **PPL-Community-Verkauf** nutzt die veröffentlichte Exponentialkurve auf `/buy` (Start **0,005 $** pro PPL; Preise und Limits öffentlich; Kauf bleibt bis zum Hub aus). Kein KYC und keine Teilnahmeprüfungen auf dieser Website.",
    roadmapNew:
      "| **Mainnet + PPL-Verkauf** | Mainnet startet. Veröffentlichte Parameter (Exponentialkurve ab **0,005 $** pro PPL, bis **100M PPL** auf der Kurve, Graduation bei **4 M$**) auf `/buy`; Käufe bleiben deaktiviert, bis der Sale-Hub deployed ist. | Mindestens 1.000 verifizierte Personen **und** ein aktives Treasury-Multisig |",
  },
  it: {
    regulationOld:
      "- **Regolazione.** Le regole variano a seconda del paese e possono cambiare. Al momento non c'è alcuna vendita pubblica di PPL; non vengono eseguiti controlli KYC.",
    regulationNew:
      "- **Regolazione.** Le regole variano per paese e possono cambiare. I parametri di vendita PPL sono su `/buy` (curva da **$0.005** per PPL); gli acquisti restano disattivati finché l'hub non è deployato. Nessun KYC né controlli di eleggibilità su questo sito.",
    changelogOld:
      "- **Al momento non c'è alcuna vendita pubblica di PPL** e non vengono eseguiti controlli KYC o di eleggibilità.",
    changelogNew:
      "- La **vendita comunitaria di PPL** usa la curva esponenziale pubblicata su `/buy` (partenza **$0.005** per PPL; prezzi e limiti pubblici; acquisto disattivato fino all'hub). Nessun KYC né controlli di eleggibilità su questo sito.",
    roadmapNew:
      "| **Mainnet + vendita PPL** | Il mainnet parte. Parametri pubblicati (curva esponenziale da **$0.005** per PPL, fino a **100M PPL** sulla curva, graduation a **$4M**) su `/buy`; acquisti disattivati finché l'hub non è deployato. | Almeno 1.000 persone verificate **e** multisig del tesoro attivo |",
  },
  tr: {
    regulationOld:
      "- **Düzenleme.** Kurallar ülkeden ülkeye farklı ve değişebilir. Şu anda halka açık bir PPL satışı yok; KYC kontrolü yapılmaz.",
    regulationNew:
      "- **Düzenleme.** Kurallar ülkeye göre değişir. PPL satış parametreleri `/buy` sayfasında (eğri **$0.005**/PPL'den); hub kontratı deploy edilene kadar alımlar kapalı. Bu sitede KYC veya uygunluk kontrolü yapılmaz.",
    changelogOld:
      "- **Şu anda halka açık bir PPL satışı yoktur** ve KYC veya uygunluk kontrolü yapılmaz.",
    changelogNew:
      "- **PPL topluluk satışı** `/buy` üzerindeki yayınlanmış üstel eğriyi kullanır (**$0.005**/PPL başlangıç; fiyatlar ve limitler açık; hub'a kadar alım kapalı). Bu sitede KYC veya uygunluk kontrolü yapılmaz.",
    roadmapNew:
      "| **Mainnet + PPL satışı** | Mainnet başlar. Yayınlanan parametreler (üstel eğri **$0.005**/PPL'den, eğride **100M PPL**, **$4M** graduation) `/buy` sayfasında; hub deploy edilene kadar alımlar kapalı. | En az 1.000 doğrulanmış kişi **ve** aktif hazine multisig |",
  },
  vi: {
    regulationOld:
      "- **Quy định.** Quy tắc khác nhau tùy theo quốc gia và có thể thay đổi. Hiện tại không có đợt bán PPL công khai nào; không thực hiện kiểm tra KYC.",
    regulationNew:
      "- **Quy định.** Quy tắc khác nhau theo quốc gia và có thể thay đổi. Tham số bán PPL được công bố trên `/buy` (đường cong từ **$0.005**/PPL); mua hàng vẫn tắt cho đến khi hub được triển khai. Không có KYC hay kiểm tra điều kiện trên trang này.",
    changelogOld:
      "- **Hiện tại không có đợt bán PPL công khai** và không thực hiện kiểm tra KYC hay điều kiện tham gia.",
    changelogNew:
      "- **Bán PPL cộng đồng** dùng đường cong mũ công bố trên `/buy` (bắt đầu **$0.005**/PPL; giá và giới hạn công khai; mua tắt đến khi có hub). Không có KYC hay kiểm tra điều kiện trên trang này.",
    roadmapNew:
      "| **Mainnet + bán PPL** | Mainnet ra mắt. Tham số công bố (đường cong mũ từ **$0.005**/PPL, tối đa **100M PPL** trên đường cong, graduation **$4M**) trên `/buy`; mua vẫn tắt cho đến khi hub triển khai. | Ít nhất 1.000 người đã xác minh **và** multisig kho bạc hoạt động |",
  },
  id: {
    regulationOld:
      "- **Regulasi.** Aturan berbeda menurut negara dan dapat berubah. Saat ini tidak ada penjualan PPL publik; tidak ada pemeriksaan KYC.",
    regulationNew:
      "- **Regulasi.** Aturan berbeda per negara dan dapat berubah. Parameter penjualan PPL ada di `/buy` (kurva dari **$0.005**/PPL); pembelian tetap nonaktif hingga hub di-deploy. Tidak ada KYC atau pemeriksaan kelayakan di situs ini.",
    changelogOld:
      "- **Saat ini tidak ada penjualan PPL publik** dan tidak ada pemeriksaan KYC atau kelayakan.",
    changelogNew:
      "- **Penjualan komunitas PPL** memakai kurva eksponensial yang dipublikasikan di `/buy` (mulai **$0.005**/PPL; harga dan batas publik; beli nonaktif hingga hub). Tidak ada KYC atau pemeriksaan kelayakan di situs ini.",
    roadmapNew:
      "| **Mainnet + penjualan PPL** | Mainnet diluncurkan. Parameter dipublikasikan (kurva eksponensial dari **$0.005**/PPL, hingga **100M PPL** di kurva, graduation **$4M**) di `/buy`; pembelian nonaktif hingga hub di-deploy. | Setidaknya 1.000 orang terverifikasi **dan** multisig treasury aktif |",
  },
  zh: {
    regulationOld:
      "- **监管。** 规则因国家而异且可能改变。目前没有公开的 PPL 销售；不进行 KYC 检查。",
    regulationNew:
      "- **监管。** 规则因国家而异且可能改变。PPL 销售参数已公布于 `/buy`（曲线从每 PPL **$0.005** 起）；在销售 hub 合约部署前购买功能保持关闭。本网站不进行 KYC 或资格检查。",
    changelogOld: "- **目前没有公开的 PPL 销售**，也不进行 KYC 或资格检查。",
    changelogNew:
      "- **PPL 社区销售**使用 `/buy` 上公布的指数曲线（起始每 PPL **$0.005**；价格与限额公开；hub 部署前购买关闭）。本网站不进行 KYC 或资格检查。",
    roadmapNew:
      "| **主网 + PPL 销售** | 主网上线。已公布参数（指数曲线从每 PPL **$0.005** 起，曲线上最多 **1 亿 PPL**，**400 万美元**毕业）见 `/buy`；hub 合约部署前购买关闭。 | 至少 **1,000** 名已验证参与者 **且** 国库多签上线 |",
  },
  ar: {
    regulationOld:
      "- **التنظيم.** القواعد تختلف حسب البلد وقد تتغير. لا يوجد بيع عام لـ PPL في الوقت الحالي؛ ولا يتم إجراء فحوصات KYC.",
    regulationNew:
      "- **التنظيم.** تختلف القواعد حسب البلد وقد تتغير. معاملات بيع PPL منشورة على `/buy` (منحنى يبدأ من **0.005$** لكل PPL)؛ تظل المشتريات معطلة حتى نشر عقد hub. لا فحوصات KYC أو أهلية على هذا الموقع.",
    changelogOld:
      "- **لا يوجد بيع عام لـ PPL في الوقت الحالي**، ولا يتم إجراء فحوصات KYC أو الأهلية.",
    changelogNew:
      "- **بيع PPL المجتمعي** يستخدم المنحنى الأسي المنشور على `/buy` (يبدأ من **0.005$** لكل PPL؛ الأسعار والحدود عامة؛ الشراء معطل حتى hub). لا فحوصات KYC أو أهلية على هذا الموقع.",
    roadmapNew:
      "| **Mainnet + بيع PPL** | يُطلق mainnet. المعاملات المنشورة (منحنى أسي من **0.005$** لكل PPL، حتى **100M PPL** على المنحنى، التخرج عند **4M$**) على `/buy`؛ المشتريات معطلة حتى نشر hub. | على الأقل **1,000** شخص موثّق **ومُلتيسِج خزينة نشط |",
  },
};

const roadmapBodyJson = {
  en: "Mainnet launches. Published sale parameters (exponential curve from $0.005 per PPL, up to 100M PPL, $4M graduation) are on /buy; purchases stay disabled until the sale hub contract is deployed.",
  ru: "Запускается mainnet. Опубликованные параметры продажи (кривая от $0.005 за PPL, до 100M PPL, graduation $4M) на /buy; покупки отключены до развёртывания hub-контракта.",
  es: "Se lanza mainnet. Parámetros publicados (curva exponencial desde $0.005 por PPL, hasta 100M PPL, graduación $4M) en /buy; compras desactivadas hasta desplegar el hub.",
  pt: "O mainnet é lançado. Parâmetros publicados (curva a partir de $0.005 por PPL, até 100M PPL, graduação $4M) em /buy; compras desativadas até o hub ser implantado.",
  fr: "Mainnet est lancé. Paramètres publiés (courbe dès 0,005 $ par PPL, jusqu'à 100M PPL, graduation 4 M$) sur /buy ; achats désactivés jusqu'au hub.",
  de: "Mainnet startet. Veröffentlichte Parameter (Kurve ab 0,005 $ pro PPL, bis 100M PPL, Graduation 4 M$) auf /buy; Käufe deaktiviert bis zum Hub.",
  it: "Il mainnet parte. Parametri pubblicati (curva da $0.005 per PPL, fino a 100M PPL, graduation $4M) su /buy; acquisti disattivati fino all'hub.",
  tr: "Mainnet başlar. Yayınlanan parametreler ($0.005/PPL'den üstel eğri, 100M PPL, $4M graduation) /buy'da; hub'a kadar alımlar kapalı.",
  vi: "Mainnet ra mắt. Tham số công bố (đường cong từ $0.005/PPL, 100M PPL, graduation $4M) trên /buy; mua tắt đến khi hub triển khai.",
  id: "Mainnet diluncurkan. Parameter (kurva dari $0.005/PPL, 100M PPL, graduation $4M) di /buy; beli nonaktif hingga hub.",
  zh: "主网上线。已公布参数（曲线从每 PPL $0.005 起，1 亿 PPL，400 万美元毕业）见 /buy；hub 部署前购买关闭。",
  ar: "يُطلق mainnet. المعاملات المنشورة (منحنى من 0.005$ لكل PPL، 100M PPL، التخرج 4M$) على /buy؛ الشراء معطل حتى hub.",
};

function replaceOrInsert(md, oldStr, newStr, label) {
  if (oldStr && md.includes(oldStr)) {
    return md.replace(oldStr, newStr);
  }
  if (newStr && !md.includes(newStr.split("|")[0].slice(0, 20))) {
    console.warn(`[${label}] pattern not found for replace; skipped old match`);
  }
  return md;
}

for (const lang of Object.keys(patches)) {
  const path = join(mdDir, `${lang}.md`);
  let md = readFileSync(path, "utf8");
  const p = patches[lang];
  if (p.roadmapOld) md = replaceOrInsert(md, p.roadmapOld, p.roadmapNew, `${lang} roadmap`);
  else if (p.roadmapNew && lang !== "en") {
    // insert roadmap row if missing old pattern — pt/it/de/tr/vi/id/zh/ar may lack table row
    const tableHeader = md.indexOf("| Stage |");
    if (tableHeader >= 0 && !md.includes(p.roadmapNew.slice(0, 30))) {
      const insertAfter = md.indexOf("\n", md.indexOf("| **Season 0", tableHeader));
      if (insertAfter > 0) {
        md = `${md.slice(0, insertAfter + 1)}${p.roadmapNew}\n${md.slice(insertAfter + 1)}`;
      }
    }
  }
  if (lang === "en" && p.roadmapOld) md = md.replace(p.roadmapOld, p.roadmapNew);
  md = replaceOrInsert(md, p.regulationOld, p.regulationNew, `${lang} regulation`);
  md = replaceOrInsert(md, p.changelogOld, p.changelogNew, `${lang} changelog`);
  writeFileSync(path, md);
}

for (const file of readdirSync(surfaces).filter((f) => f.startsWith("litepaper-") && f.endsWith(".json"))) {
  const lang = file.replace("litepaper-", "").replace(".json", "");
  const body = roadmapBodyJson[lang];
  if (!body) continue;
  const doc = JSON.parse(readFileSync(join(surfaces, file), "utf8"));
  const stage = doc.charts?.roadmapStages?.[1];
  if (stage) stage.body = body;
  writeFileSync(join(surfaces, file), `${JSON.stringify(doc)}\n`);
}

console.log("Litepaper public sale copy applied.");
