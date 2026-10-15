#!/usr/bin/env node
/**
 * Localized legal surfaces: full page chrome + Public PPL sale block per locale.
 * Other blocks stay English until a dedicated legal translation pass lands.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const surfaces = join(dirname(fileURLToPath(import.meta.url)), "../src/lib/locales/surfaces");
const en = JSON.parse(readFileSync(join(surfaces, "legal-en.json"), "utf8"));

const saleBody = {
  ru: [
    "Опубликованные параметры продажи PPL (формула кривой, траектория цены, лимиты и цель graduation) на странице /buy совпадают с API заказов. Покупки отключены, пока не развёрнут hub-контракт продажи; подключение кошелька ни к чему не обязывает. KYC и проверки допустимости на этом сайте не проводятся.",
    "Ничто на сайте не является офертой или обещанием продать PPL там, где продажа ограничена; участие может быть недоступно в вашей юрисдикции. Условия продажи меняются только через опубликованные обновления и governance, где применимо.",
  ],
  es: [
    "Los parámetros publicados de la venta de PPL (fórmula de la curva, trayectoria de precio, límites y objetivo de graduación) están en /buy y coinciden con la API de pedidos. Las compras siguen desactivadas hasta desplegar el hub de venta; conectar la wallet no te compromete a nada. No hay KYC ni comprobaciones de elegibilidad en este sitio.",
    "Nada en este sitio es una oferta ni promesa de venta de PPL donde esté restringida; la participación puede no estar disponible en tu jurisdicción. Los términos de venta solo cambian mediante actualizaciones publicadas y gobernanza cuando aplique.",
  ],
  pt: [
    "Os parâmetros publicados da venda de PPL (fórmula da curva, trajetória de preço, limites e meta de graduação) estão em /buy e coincidem com a API de pedidos. As compras permanecem desativadas até o hub de venda ser implantado; conectar a carteira não te obriga a nada. Não há KYC nem verificações de elegibilidade neste site.",
    "Nada neste site é oferta ou promessa de venda de PPL onde a venda seja restrita; a participação pode estar indisponível na sua jurisdição. Os termos de venda mudam apenas por atualizações publicadas e governança quando aplicável.",
  ],
  fr: [
    "Les paramètres publiés de la vente PPL (formule de courbe, trajectoire de prix, limites et objectif de graduation) sont sur /buy et correspondent à l'API de commande. Les achats restent désactivés tant que le hub de vente n'est pas déployé ; connecter un portefeuille ne vous engage à rien. Aucun KYC ni contrôle d'éligibilité sur ce site.",
    "Rien sur ce site n'est une offre ni une promesse de vente de PPL où la vente est restreinte ; la participation peut être indisponible dans votre juridiction. Les conditions de vente changent uniquement via des mises à jour publiées et la gouvernance le cas échéant.",
  ],
  de: [
    "Die veröffentlichten PPL-Verkaufsparameter (Kurvenformel, Preispfad, Limits und Graduation-Ziel) stehen auf /buy und entsprechen der Order-API. Käufe bleiben deaktiviert, bis der Sale-Hub deployed ist; eine Wallet-Verbindung verpflichtet zu nichts. Kein KYC und keine Teilnahmeprüfungen auf dieser Website.",
    "Nichts auf dieser Website ist ein Angebot oder Versprechen, PPL zu verkaufen, wo der Verkauf eingeschränkt ist; die Teilnahme kann in Ihrer Rechtsordnung nicht verfügbar sein. Verkaufsbedingungen ändern sich nur durch veröffentlichte Updates und Governance, wo zutreffend.",
  ],
  it: [
    "I parametri pubblicati della vendita PPL (formula della curva, percorso di prezzo, limiti e obiettivo di graduation) sono su /buy e corrispondono all'API ordini. Gli acquisti restano disattivati finché l'hub di vendita non è deployato; collegare il wallet non ti impegna a nulla. Nessun KYC né controlli di eleggibilità su questo sito.",
    "Nulla su questo sito è un'offerta o promessa di vendere PPL dove la vendita è limitata; la partecipazione può non essere disponibile nella tua giurisdizione. I termini di vendita cambiano solo tramite aggiornamenti pubblicati e governance ove applicabile.",
  ],
  tr: [
    "Yayınlanan PPL satış parametreleri (eğri formülü, fiyat yolu, limitler ve graduation hedefi) /buy sayfasında ve sipariş API'si ile uyumlu. Hub kontratı deploy edilene kadar alımlar kapalı; cüzdan bağlamak sizi hiçbir şeye bağlamaz. Bu sitede KYC veya uygunluk kontrolü yapılmaz.",
    "Bu sitede hiçbir şey, satışın kısıtlı olduğu yerlerde PPL satışı teklifi veya vaadi değildir; katılım yargı alanınızda kullanılamayabilir. Satış koşulları yalnızca yayınlanan güncellemeler ve uygun olduğunda governance ile değişir.",
  ],
  vi: [
    "Tham số bán PPL công bố (công thức đường cong, quỹ đạo giá, giới hạn và mục tiêu graduation) ở /buy và khớp API đặt hàng. Mua vẫn tắt cho đến khi hub triển khai; kết nối ví không ràng buộc bạn. Không có KYC hay kiểm tra điều kiện trên trang này.",
    "Không có nội dung trên trang là đề nghị hay cam kết bán PPL nơi bán bị hạn chế; tham gia có thể không khả dụng ở khu vực pháp lý của bạn. Điều khoản bán chỉ thay đổi qua cập nhật công bố và quản trị khi áp dụng.",
  ],
  id: [
    "Parameter penjualan PPL yang dipublikasikan (rumus kurva, jalur harga, batas, dan target graduation) ada di /buy dan sesuai API pesanan. Pembelian tetap nonaktif hingga hub di-deploy; menghubungkan dompet tidak mengikat Anda. Tidak ada KYC atau pemeriksaan kelayakan di situs ini.",
    "Tidak ada di situs ini yang merupakan penawaran atau janji menjual PPL di tempat penjualan dibatasi; partisipasi mungkin tidak tersedia di yurisdiksi Anda. Ketentuan penjualan hanya berubah melalui pembaruan yang dipublikasikan dan tata kelola jika berlaku.",
  ],
  zh: [
    "已公布的 PPL 销售参数（曲线公式、价格路径、限额与毕业目标）见 /buy 页面，并与订单 API 一致。在销售 hub 合约部署前购买功能保持关闭；连接钱包不构成任何承诺。本网站不进行 KYC 或资格检查。",
    "本网站任何内容均不构成在受限地区出售 PPL 的要约或承诺；您所在司法辖区可能无法参与。销售条款仅通过公布的更新及适用的治理程序变更。",
  ],
  ar: [
    "معاملات بيع PPL المنشورة (صيغة المنحنى، مسار السعر، الحدود وهدف التخرج) على /buy وتطابق API الطلبات. تظل المشتريات معطلة حتى نشر عقد hub؛ ربط المحفظة لا يلزمك بشيء. لا فحوصات KYC أو أهلية على هذا الموقع.",
    "لا شيء على هذا الموقع عرض أو وعد ببيع PPL حيث يكون البيع مقيدًا؛ قد لا يكون المشاركة متاحة في ولايتك القضائية. تتغير شروط البيع فقط عبر التحديثات المنشورة والحوكمة عند الانطباق.",
  ],
};

const chrome = {
  ru: {
    privacy: { title: "Политика конфиденциальности", subtitle: "Как сайт People's Blockchain обрабатывает данные при просмотре, входе и использовании партнёрских инструментов.", backHome: "На главную", relatedTerms: "Условия использования", relatedPrivacy: "Политика конфиденциальности", contactTitle: "Контакты" },
    terms: { title: "Условия использования", subtitle: "Правила использования сайта People's Blockchain и партнёрских инструментов, пока сеть в тесте/beta.", backHome: "На главную", relatedTerms: "Условия использования", relatedPrivacy: "Политика конфиденциальности", contactTitle: "Контакты", saleTitle: "Публичная продажа PPL" },
  },
  es: {
    privacy: { title: "Política de privacidad", subtitle: "Cómo el sitio de People's Blockchain trata la información al navegar, iniciar sesión o usar herramientas de socio.", backHome: "Volver al inicio", relatedTerms: "Términos del servicio", relatedPrivacy: "Política de privacidad", contactTitle: "Contacto" },
    terms: { title: "Términos del servicio", subtitle: "Reglas para usar el sitio de People's Blockchain y herramientas de socio mientras la red está en prueba/beta.", backHome: "Volver al inicio", relatedTerms: "Términos del servicio", relatedPrivacy: "Política de privacidad", contactTitle: "Contacto", saleTitle: "Venta pública de PPL" },
  },
  pt: {
    privacy: { title: "Política de privacidade", subtitle: "Como o site People's Blockchain trata informações ao navegar, entrar ou usar ferramentas de parceiro.", backHome: "Voltar ao início", relatedTerms: "Termos de serviço", relatedPrivacy: "Política de privacidade", contactTitle: "Contato" },
    terms: { title: "Termos de serviço", subtitle: "Regras para usar o site People's Blockchain e ferramentas de parceiro enquanto a rede está em teste/beta.", backHome: "Voltar ao início", relatedTerms: "Termos de serviço", relatedPrivacy: "Política de privacidade", contactTitle: "Contato", saleTitle: "Venda pública de PPL" },
  },
  fr: {
    privacy: { title: "Politique de confidentialité", subtitle: "Comment le site People's Blockchain traite les informations lors de la navigation, de la connexion ou de l'utilisation des outils partenaires.", backHome: "Retour à l'accueil", relatedTerms: "Conditions d'utilisation", relatedPrivacy: "Politique de confidentialité", contactTitle: "Contact" },
    terms: { title: "Conditions d'utilisation", subtitle: "Règles d'utilisation du site People's Blockchain et des outils partenaires pendant la phase test/bêta.", backHome: "Retour à l'accueil", relatedTerms: "Conditions d'utilisation", relatedPrivacy: "Politique de confidentialité", contactTitle: "Contact", saleTitle: "Vente publique de PPL" },
  },
  de: {
    privacy: { title: "Datenschutz", subtitle: "Wie die People's-Blockchain-Website Informationen beim Surfen, Anmelden oder Nutzen von Partner-Tools verarbeitet.", backHome: "Zur Startseite", relatedTerms: "Nutzungsbedingungen", relatedPrivacy: "Datenschutz", contactTitle: "Kontakt" },
    terms: { title: "Nutzungsbedingungen", subtitle: "Regeln für die Website People's Blockchain und Partner-Tools, solange das Netz im Test/Beta ist.", backHome: "Zur Startseite", relatedTerms: "Nutzungsbedingungen", relatedPrivacy: "Datenschutz", contactTitle: "Kontakt", saleTitle: "Öffentlicher PPL-Verkauf" },
  },
  it: {
    privacy: { title: "Informativa sulla privacy", subtitle: "Come il sito People's Blockchain gestisce le informazioni durante navigazione, accesso e strumenti partner.", backHome: "Torna alla home", relatedTerms: "Termini di servizio", relatedPrivacy: "Informativa sulla privacy", contactTitle: "Contatti" },
    terms: { title: "Termini di servizio", subtitle: "Regole per usare il sito People's Blockchain e gli strumenti partner mentre la rete è in test/beta.", backHome: "Torna alla home", relatedTerms: "Termini di servizio", relatedPrivacy: "Informativa sulla privacy", contactTitle: "Contatti", saleTitle: "Vendita pubblica di PPL" },
  },
  tr: {
    privacy: { title: "Gizlilik politikası", subtitle: "People's Blockchain sitesinin gezinme, giriş ve ortak araçları kullanımında bilgileri nasıl işlediği.", backHome: "Ana sayfaya dön", relatedTerms: "Hizmet şartları", relatedPrivacy: "Gizlilik politikası", contactTitle: "İletişim" },
    terms: { title: "Hizmet şartları", subtitle: "Ağ test/beta aşamasındayken People's Blockchain sitesi ve ortak araçları için kurallar.", backHome: "Ana sayfaya dön", relatedTerms: "Hizmet şartları", relatedPrivacy: "Gizlilik politikası", contactTitle: "İletişim", saleTitle: "Halka açık PPL satışı" },
  },
  vi: {
    privacy: { title: "Chính sách quyền riêng tư", subtitle: "Cách trang People's Blockchain xử lý thông tin khi bạn duyệt, đăng nhập hoặc dùng công cụ đối tác.", backHome: "Về trang chủ", relatedTerms: "Điều khoản dịch vụ", relatedPrivacy: "Chính sách quyền riêng tư", contactTitle: "Liên hệ" },
    terms: { title: "Điều khoản dịch vụ", subtitle: "Quy tắc sử dụng trang People's Blockchain và công cụ đối tác khi mạng đang test/beta.", backHome: "Về trang chủ", relatedTerms: "Điều khoản dịch vụ", relatedPrivacy: "Chính sách quyền riêng tư", contactTitle: "Liên hệ", saleTitle: "Bán PPL công khai" },
  },
  id: {
    privacy: { title: "Kebijakan privasi", subtitle: "Bagaimana situs People's Blockchain menangani informasi saat menjelajah, masuk, atau menggunakan alat mitra.", backHome: "Kembali ke beranda", relatedTerms: "Ketentuan layanan", relatedPrivacy: "Kebijakan privasi", contactTitle: "Kontak" },
    terms: { title: "Ketentuan layanan", subtitle: "Aturan menggunakan situs People's Blockchain dan alat mitra saat jaringan dalam uji/beta.", backHome: "Kembali ke beranda", relatedTerms: "Ketentuan layanan", relatedPrivacy: "Kebijakan privasi", contactTitle: "Kontak", saleTitle: "Penjualan PPL publik" },
  },
  zh: {
    privacy: { title: "隐私政策", subtitle: "People's Blockchain 网站在浏览、登录或使用合作伙伴工具时如何处理信息。", backHome: "返回首页", relatedTerms: "服务条款", relatedPrivacy: "隐私政策", contactTitle: "联系" },
    terms: { title: "服务条款", subtitle: "在网络处于测试/测试版阶段时使用 People's Blockchain 网站与合作伙伴工具的规则。", backHome: "返回首页", relatedTerms: "服务条款", relatedPrivacy: "隐私政策", contactTitle: "联系", saleTitle: "PPL 公开销售" },
  },
  ar: {
    privacy: { title: "سياسة الخصوصية", subtitle: "كيف يتعامل موقع People's Blockchain مع المعلومات عند التصفح أو تسجيل الدخول أو استخدام أدوات الشريك.", backHome: "العودة للرئيسية", relatedTerms: "شروط الخدمة", relatedPrivacy: "سياسة الخصوصية", contactTitle: "اتصل بنا" },
    terms: { title: "شروط الخدمة", subtitle: "قواعد استخدام موقع People's Blockchain وأدوات الشريك أثناء مرحلة الاختبار/التجريب.", backHome: "العودة للرئيسية", relatedTerms: "شروط الخدمة", relatedPrivacy: "سياسة الخصوصية", contactTitle: "اتصل بنا", saleTitle: "بيع PPL العام" },
  },
};

function patchSale(doc, lang) {
  const idx = doc.terms.blocks.findIndex((b) => b.title === "Public PPL sale");
  if (idx < 0) throw new Error("sale block missing");
  doc.terms.blocks[idx] = {
    title: chrome[lang].terms.saleTitle,
    body: saleBody[lang],
  };
}

for (const lang of Object.keys(saleBody)) {
  const doc = JSON.parse(JSON.stringify(en));
  Object.assign(doc.privacy, chrome[lang].privacy);
  Object.assign(doc.terms, chrome[lang].terms);
  patchSale(doc, lang);
  writeFileSync(join(surfaces, `legal-${lang}.json`), `${JSON.stringify(doc, null, 2)}\n`);
}

console.log(`Wrote legal surfaces for ${Object.keys(saleBody).length} locales.`);
