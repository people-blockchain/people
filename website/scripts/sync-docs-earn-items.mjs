/**
 * One-off sync: docs-* earn section → 6 items + updated titles (matches docs-en / docs-content).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../src/lib/locales/surfaces");
const langs = ["es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];

const earnPatch = {
  es: {
    title: "Formas de participar",
    itemsTail: [
      {
        title: "Referidos Growth",
        text: "Dos niveles, L1 y L2. Los pesos 70/30 se aplican a un presupuesto de liquidación elegible, no al importe de cada transferencia. Se aplican actividad, antigüedad de participación, maduración y topes. Una invitación sola no genera un pago. Consulta y reclama recompensas Growth en el portal de socios cuando cumplas los requisitos.",
      },
      {
        title: "Participación móvil",
        text: "Sesiones de participación en un toque desde el móvil. Las recompensas dependen de actividad verificada, no de mantener una página abierta ni de «minar» PPL.",
      },
      {
        title: "Prueba de humanidad",
        text: "Comprobaciones multisignal sin biometría ni datos personales en bruto almacenados en cadena.",
      },
      {
        title: "Puntos de participación",
        text: "Los puntos fijan tu parte de las recompensas del Community Pool procedentes de las comisiones de red. No se pueden comprar ni transferir.",
      },
    ],
  },
  pt: {
    title: "Formas de participar",
    itemsTail: [
      {
        title: "Referências Growth",
        text: "Dois níveis, L1 e L2. Os pesos 70/30 aplicam-se a um orçamento de liquidação elegível, não ao montante de cada transferência. Aplicam-se atividade, idade de participação, maturação e limites. Um convite sozinho não gera pagamento. Veja e reclame recompensas Growth no portal de parceiros quando cumprir os requisitos.",
      },
      {
        title: "Participação móvel",
        text: "Sessões de participação num toque a partir do telemóvel. As recompensas dependem de atividade verificada, não de manter uma página aberta ou de «minerar» PPL.",
      },
      {
        title: "Prova de humanidade",
        text: "Verificações multisinal sem biometria nem dados pessoais brutos armazenados on-chain.",
      },
      {
        title: "Pontos de participação",
        text: "Os pontos definem a sua parte das recompensas do Community Pool a partir das taxas de rede. Não podem ser comprados nem transferidos.",
      },
    ],
  },
  fr: {
    title: "Façons de participer",
    itemsTail: [
      {
        title: "Parrainage Growth",
        text: "Deux niveaux, L1 et L2. Les poids 70/30 s’appliquent à un budget de règlement éligible, pas au montant de chaque transfert. Activité, ancienneté de participation, maturation et plafonds s’appliquent. Une invitation seule ne génère pas de paiement. Consultez et réclamez les récompenses Growth via le portail partenaire lorsque vous êtes éligible.",
      },
      {
        title: "Participation mobile",
        text: "Sessions de participation en un tap depuis le téléphone. Les récompenses dépendent d’une activité vérifiée, pas d’une page ouverte ou d’un « minage » de PPL.",
      },
      {
        title: "Preuve d’humanité",
        text: "Contrôles multisignaux sans biométrie ni données personnelles brutes stockées on-chain.",
      },
      {
        title: "Points de participation",
        text: "Les points déterminent votre part des récompenses du Community Pool issues des frais réseau. Ils ne peuvent être achetés ni transférés.",
      },
    ],
  },
  de: {
    title: "Wege zur Teilnahme",
    itemsTail: [
      {
        title: "Growth-Empfehlungen",
        text: "Zwei Ebenen, L1 und L2. Die Gewichte 70/30 gelten für ein berechtigtes Abrechnungsbudget, nicht für den Betrag jeder Überweisung. Aktivität, Teilnahmealter, Reifung und Obergrenzen gelten. Eine Einladung allein bringt keine Zahlung. Growth-Belohnungen im Partnerportal einsehen und abholen, wenn Sie berechtigt sind.",
      },
      {
        title: "Mobile Teilnahme",
        text: "Teilnahmesitzungen per Tap vom Handy. Belohnungen hängen von verifizierter Aktivität ab, nicht vom offenen Tab oder „Mining“ von PPL.",
      },
      {
        title: "Proof of Humanity",
        text: "Multisignal-Prüfungen ohne Biometrie und ohne Roh-Personendaten on-chain.",
      },
      {
        title: "Teilnahmepunkte",
        text: "Punkte bestimmen Ihren Anteil an Community-Pool-Belohnungen aus Netzwerkgebühren. Sie können nicht gekauft oder übertragen werden.",
      },
    ],
  },
  it: {
    title: "Modi per partecipare",
    itemsTail: [
      {
        title: "Referral Growth",
        text: "Due livelli, L1 e L2. I pesi 70/30 si applicano a un budget di regolamento elegibile, non all’importo di ogni trasferimento. Contano attività, anzianità di partecipazione, maturazione e limiti. Un invito da solo non genera un pagamento. Visualizza e riscuoti le ricompense Growth dal portale partner quando sei idoneo.",
      },
      {
        title: "Partecipazione mobile",
        text: "Sessioni di partecipazione con un tap dal telefono. Le ricompense dipendono da attività verificata, non da una pagina aperta o dal «mining» di PPL.",
      },
      {
        title: "Proof of humanity",
        text: "Controlli multisignal senza biometria né dati personali grezzi on-chain.",
      },
      {
        title: "Punti di partecipazione",
        text: "I punti definiscono la tua quota delle ricompense del Community Pool dalle commissioni di rete. Non si possono comprare o trasferire.",
      },
    ],
  },
  tr: {
    title: "Katılım yolları",
    itemsTail: [
      {
        title: "Growth yönlendirmeleri",
        text: "İki seviye: L1 ve L2. 70/30 ağırlıkları her transferin tutarına değil, uygun bir uzlaşma bütçesine uygulanır. Etkinlik, katılım yaşı, olgunlaşma ve üst sınırlar geçerlidir. Yalnızca davet ödeme getirmez. Uygun olduğunuzda Growth ödüllerini partner portalından görüntüleyip talep edin.",
      },
      {
        title: "Mobil katılım",
        text: "Telefondan tek dokunuşla katılım oturumları. Ödüller doğrulanmış etkinliğe bağlıdır; açık sekme veya PPL «madenciliği» değil.",
      },
      {
        title: "İnsan kanıtı",
        text: "Biyometri olmadan ve ham kişisel verileri zincire yazmadan çok sinyalli kontroller.",
      },
      {
        title: "Katılım puanları",
        text: "Puanlar, ağ ücretlerinden Community Pool ödüllerindeki payınızı belirler. Satın alınamaz veya transfer edilemez.",
      },
    ],
  },
  vi: {
    title: "Cách tham gia",
    itemsTail: [
      {
        title: "Giới thiệu Growth",
        text: "Hai cấp L1 và L2. Trọng số 70/30 áp dụng cho ngân sách thanh toán đủ điều kiện, không phải số tiền mỗi lần chuyển. Có áp dụng hoạt động, tuổi tham gia, chín muồi và trần. Một lời mời đơn thuần không tạo khoản trả. Xem và nhận thưởng Growth qua cổng đối tác khi đủ điều kiện.",
      },
      {
        title: "Tham gia trên di động",
        text: "Phiên tham gia một chạm từ điện thoại. Phần thưởng phụ thuộc hoạt động đã xác minh, không phải giữ trang mở hay «đào» PPL.",
      },
      {
        title: "Chứng minh con người",
        text: "Kiểm tra đa tín hiệu, không sinh trắc học và không lưu dữ liệu cá nhân thô on-chain.",
      },
      {
        title: "Điểm tham gia",
        text: "Điểm xác định phần thưởng Community Pool từ phí mạng của bạn. Không thể mua hay chuyển nhượng.",
      },
    ],
  },
  id: {
    title: "Cara ikut serta",
    itemsTail: [
      {
        title: "Referral Growth",
        text: "Dua level, L1 dan L2. Bobot 70/30 berlaku untuk anggaran penyelesaian yang memenuhi syarat, bukan jumlah setiap transfer. Berlaku aktivitas, usia partisipasi, maturasi, dan batas. Undangan saja tidak menghasilkan pembayaran. Lihat dan klaim imbalan Growth lewat portal mitra jika memenuhi syarat.",
      },
      {
        title: "Partisipasi seluler",
        text: "Sesi partisipasi sekali ketuk dari ponsel. Imbalan bergantung pada aktivitas terverifikasi, bukan tab terbuka atau «mining» PPL.",
      },
      {
        title: "Bukti kemanusiaan",
        text: "Pemeriksaan multi-sinyal tanpa biometrik dan tanpa data pribadi mentah on-chain.",
      },
      {
        title: "Poin partisipasi",
        text: "Poin menentukan bagian imbalan Community Pool dari biaya jaringan. Tidak bisa dibeli atau ditransfer.",
      },
    ],
  },
  zh: {
    title: "参与方式",
    itemsTail: [
      {
        title: "Growth 推荐",
        text: "两个层级 L1 与 L2。70/30 权重适用于符合条件的结算预算，而非每笔转账金额。活动、参与时长、成熟度和上限均适用。仅有邀请不会产生付款。满足条件时在合作伙伴门户查看并领取 Growth 奖励。",
      },
      {
        title: "移动参与",
        text: "手机上一键参与的会话。奖励取决于经核验的活动，而非保持页面打开或「挖」PPL。",
      },
      {
        title: "人类证明",
        text: "多信号校验，无需生物识别，链上不存储原始个人数据。",
      },
      {
        title: "参与点数",
        text: "点数决定你在网络手续费 Community Pool 奖励中的份额。不可购买或转让。",
      },
    ],
  },
  ar: {
    title: "طرق المشاركة",
    itemsTail: [
      {
        title: "إحالات Growth",
        text: "مستويان L1 وL2. أوزان 70/30 تُطبَّق على ميزانية تسوية مؤهلة وليس على مبلغ كل تحويل. تُطبَّق النشاط وعمر المشاركة والنضج والحدود. الدعوة وحدها لا تُنتج دفعة. اعرض مكافآت Growth واطلبها عبر بوابة الشركاء عند استيفاء الشروط.",
      },
      {
        title: "المشاركة عبر الجوال",
        text: "جلسات مشاركة بلمسة واحدة من الهاتف. المكافآت تعتمد على نشاط مُتحقَّق منه، لا على إبقاء صفحة مفتوحة أو «تعدين» PPL.",
      },
      {
        title: "إثبات الإنسانية",
        text: "فحوص متعددة الإشارات دون بيانات حيوية ودون تخزين بيانات شخصية خام على السلسلة.",
      },
      {
        title: "نقاط المشاركة",
        text: "النقاط تحدد حصتك من مكافآت Community Pool من رسوم الشبكة. لا يمكن شراؤها أو نقلها.",
      },
    ],
  },
};

for (const lang of langs) {
  const path = join(dir, `docs-${lang}.json`);
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const earn = doc.sections.find((s) => s.id === "earn");
  const patch = earnPatch[lang];
  if (!earn || !patch) throw new Error(`missing earn patch for ${lang}`);

  earn.title = patch.title;
  const head = earn.items.slice(0, 2);
  if (head.length !== 2) {
    throw new Error(`${lang} earn expected 2 head items, got ${head.length}`);
  }
  earn.items = [...head, ...patch.itemsTail];
  if (earn.items.length !== 6) {
    throw new Error(`${lang} earn items length ${earn.items.length}`);
  }

  writeFileSync(path, `${JSON.stringify(doc)}\n`, "utf8");
  console.log(`updated docs-${lang}.json earn → 6 items`);
}
