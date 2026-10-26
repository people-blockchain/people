import { pickLang } from "../telegram-lang.ts";

const LOCALES = ["en", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar", "ru", "ka", "hy", "uk"] as const;

export type TelegramBotLocale = (typeof LOCALES)[number];

/** Site locale (from the deep link) first, then Telegram language_code; anything else → English. */
export function telegramBotLocale(languageCode?: string, siteLocale?: string | null): TelegramBotLocale {
  return pickLang(LOCALES, siteLocale, languageCode);
}

const MESSAGES: Record<string, Record<TelegramBotLocale, string>> = {
  "sharePhonePrompt": {
    "en": "Hello! This is PEOPLE Verify, the official verification bot of PEOPLE Blockchain.\n\nWe confirm that you are a real person, so that founders are people, not bots. Your number is never published and is used only for verification.\n\n👇 Tap the green «📱 Share phone number» button below.",
    "es": "¡Hola! Este es PEOPLE Verify, el bot oficial de verificación de PEOPLE Blockchain.\n\nConfirmamos que eres una persona real, para que los fundadores sean personas y no bots. Tu número nunca se publica y solo se usa para la verificación.\n\n👇 Pulsa el botón verde «📱 Compartir número» abajo.",
    "pt": "Olá! Este é o PEOPLE Verify, o bot oficial de verificação da PEOPLE Blockchain.\n\nConfirmamos que você é uma pessoa real, para que os fundadores sejam pessoas e não bots. Seu número nunca é publicado e é usado apenas para a verificação.\n\n👇 Toque no botão verde «📱 Compartilhar número» abaixo.",
    "fr": "Bonjour ! Voici PEOPLE Verify, le bot officiel de vérification de PEOPLE Blockchain.\n\nNous confirmons que vous êtes une vraie personne, pour que les fondateurs soient des humains et non des bots. Votre numéro n'est jamais publié et sert uniquement à la vérification.\n\n👇 Appuyez sur le bouton vert « 📱 Partager mon numéro » ci-dessous.",
    "de": "Hallo! Das ist PEOPLE Verify, der offizielle Verifizierungs-Bot von PEOPLE Blockchain.\n\nWir bestätigen, dass du ein echter Mensch bist, damit Gründer Menschen sind und keine Bots. Deine Nummer wird nie veröffentlicht und nur zur Verifizierung genutzt.\n\n👇 Tippe unten auf den grünen Button «📱 Nummer teilen».",
    "it": "Ciao! Questo è PEOPLE Verify, il bot ufficiale di verifica di PEOPLE Blockchain.\n\nConfermiamo che sei una persona reale, così i fondatori sono persone e non bot. Il tuo numero non viene mai pubblicato ed è usato solo per la verifica.\n\n👇 Tocca il pulsante verde «📱 Condividi numero» qui sotto.",
    "tr": "Merhaba! Bu, PEOPLE Blockchain'in resmi doğrulama botu PEOPLE Verify.\n\nKurucuların bot değil gerçek insanlar olması için gerçek bir kişi olduğunuzu doğruluyoruz. Numaranız asla yayınlanmaz ve yalnızca doğrulama için kullanılır.\n\n👇 Aşağıdaki yeşil «📱 Numarayı paylaş» düğmesine dokunun.",
    "vi": "Xin chào! Đây là PEOPLE Verify, bot xác minh chính thức của PEOPLE Blockchain.\n\nChúng tôi xác nhận bạn là người thật, để những người sáng lập là con người chứ không phải bot. Số của bạn không bao giờ được công khai và chỉ dùng để xác minh.\n\n👇 Nhấn nút màu xanh «📱 Chia sẻ số điện thoại» bên dưới.",
    "id": "Halo! Ini PEOPLE Verify, bot verifikasi resmi PEOPLE Blockchain.\n\nKami memastikan Anda adalah orang sungguhan, agar para pendiri adalah manusia, bukan bot. Nomor Anda tidak pernah dipublikasikan dan hanya dipakai untuk verifikasi.\n\n👇 Ketuk tombol hijau «📱 Bagikan nomor» di bawah.",
    "zh": "您好！这是 PEOPLE Verify，PEOPLE Blockchain 的官方验证机器人。\n\n我们确认您是真实的人，让创始人都是真人而不是机器人。您的号码绝不会公开，仅用于验证。\n\n👇 请点击下方绿色按钮「📱 分享手机号」。",
    "ar": "مرحبًا! هذا PEOPLE Verify، بوت التحقق الرسمي لـ PEOPLE Blockchain.\n\nنتأكد من أنك شخص حقيقي، ليكون المؤسسون بشرًا لا بوتات. لا يُنشر رقمك أبدًا ويُستخدم للتحقق فقط.\n\n👇 اضغط الزر الأخضر «📱 مشاركة الرقم» في الأسفل.",
    "ru": "Здравствуйте! Это PEOPLE Verify — официальный бот проверки PEOPLE Blockchain.\n\nОн подтверждает, что вы реальный человек, чтобы основателями стали люди, а не боты. Номер не публикуется и нужен только для проверки.\n\n👇 Нажмите зелёную кнопку «📱 Поделиться номером» внизу.",
    "ka": "გამარჯობა! ეს არის PEOPLE Verify — PEOPLE Blockchain-ის ოფიციალური ვერიფიკაციის ბოტი.\n\nჩვენ ვადასტურებთ, რომ რეალური ადამიანი ხართ, რათა დამფუძნებლები ადამიანები იყვნენ და არა ბოტები. თქვენი ნომერი არასდროს ქვეყნდება და მხოლოდ ვერიფიკაციისთვის გამოიყენება.\n\n👇 დააჭირეთ ქვემოთ მწვანე ღილაკს «📱 ნომრის გაზიარება».",
    "hy": "Բարև։ Սա PEOPLE Verify-ն է՝ PEOPLE Blockchain-ի պաշտոնական ստուգման բոտը։\n\nՄենք հաստատում ենք, որ դուք իրական մարդ եք, որպեսզի հիմնադիրները լինեն մարդիկ, ոչ թե բոտեր։ Ձեր համարը երբեք չի հրապարակվում և օգտագործվում է միայն ստուգման համար։\n\n👇 Սեղմեք ներքևի կանաչ «📱 Կիսվել համարով» կոճակը։",
    "uk": "Вітаємо! Це PEOPLE Verify — офіційний бот перевірки PEOPLE Blockchain.\n\nВін підтверджує, що ви реальна людина, щоб засновниками стали люди, а не боти. Номер не публікується і потрібен лише для перевірки.\n\n👇 Натисніть зелену кнопку «📱 Поділитися номером» внизу."
  },
  "sharePhoneButton": {
    "en": "📱 Share phone number",
    "es": "📱 Compartir número",
    "pt": "📱 Compartilhar número",
    "fr": "📱 Partager mon numéro",
    "de": "📱 Nummer teilen",
    "it": "📱 Condividi numero",
    "tr": "📱 Numarayı paylaş",
    "vi": "📱 Chia sẻ số điện thoại",
    "id": "📱 Bagikan nomor",
    "zh": "📱 分享手机号",
    "ar": "📱 مشاركة الرقم",
    "ru": "📱 Поделиться номером",
    "ka": "📱 ნომრის გაზიარება",
    "hy": "📱 Կիսվել համարով",
    "uk": "📱 Поділитися номером"
  },
  "invalidLink": {
    "en": "This link is invalid or expired. Open the bot again from the Founders page on the site.",
    "es": "Este enlace no es válido o ha caducado. Abre el bot de nuevo desde la página de Fundadores del sitio.",
    "pt": "Este link é inválido ou expirou. Abra o bot novamente pela página de Fundadores do site.",
    "fr": "Ce lien est invalide ou a expiré. Rouvrez le bot depuis la page Fondateurs du site.",
    "de": "Dieser Link ist ungültig oder abgelaufen. Öffne den Bot erneut über die Gründer-Seite der Website.",
    "it": "Questo link non è valido o è scaduto. Riapri il bot dalla pagina Fondatori del sito.",
    "tr": "Bu bağlantı geçersiz veya süresi dolmuş. Botu sitedeki Kurucular sayfasından yeniden açın.",
    "vi": "Liên kết không hợp lệ hoặc đã hết hạn. Hãy mở lại bot từ trang Nhà sáng lập trên trang web.",
    "id": "Tautan ini tidak valid atau kedaluwarsa. Buka bot lagi dari halaman Pendiri di situs.",
    "zh": "该链接无效或已过期。请从网站的创始人页面重新打开机器人。",
    "ar": "هذا الرابط غير صالح أو منتهي الصلاحية. افتح البوت مجددًا من صفحة المؤسسين على الموقع.",
    "ru": "Ссылка недействительна или истекла. Откройте бота снова со страницы основателей на сайте.",
    "ka": "ბმული არასწორია ან ვადაგასულია. ხელახლა გახსენით ბოტი საიტის დამფუძნებლების გვერდიდან.",
    "hy": "Հղումն անվավեր է կամ ժամկետանց։ Կրկին բացեք բոտը կայքի Հիմնադիրներ էջից։",
    "uk": "Посилання недійсне або застаріле. Відкрийте бота знову зі сторінки засновників на сайті."
  },
  "success": {
    "en": "✅ Telegram verification recorded. Return to the site: level 1 is active (50% of base points).",
    "es": "✅ Verificación de Telegram registrada. Vuelve al sitio: el nivel 1 está activo (50% de los puntos base).",
    "pt": "✅ Verificação do Telegram registrada. Volte ao site: o nível 1 está ativo (50% dos pontos base).",
    "fr": "✅ Vérification Telegram enregistrée. Revenez sur le site : le niveau 1 est actif (50 % des points de base).",
    "de": "✅ Telegram-Verifizierung gespeichert. Kehre zur Website zurück: Stufe 1 ist aktiv (50 % der Basispunkte).",
    "it": "✅ Verifica Telegram registrata. Torna al sito: il livello 1 è attivo (50% dei punti base).",
    "tr": "✅ Telegram doğrulaması kaydedildi. Siteye dönün: seviye 1 aktif (temel puanların %50'si).",
    "vi": "✅ Đã ghi nhận xác minh Telegram. Hãy quay lại trang web: cấp 1 đã kích hoạt (50% điểm cơ bản).",
    "id": "✅ Verifikasi Telegram tercatat. Kembali ke situs: level 1 aktif (50% poin dasar).",
    "zh": "✅ Telegram 验证已记录。请返回网站：1 级已激活（基础积分的 50%）。",
    "ar": "✅ تم تسجيل التحقق عبر Telegram. عد إلى الموقع: المستوى 1 مفعّل (50% من النقاط الأساسية).",
    "ru": "✅ Верификация Telegram записана. Вернитесь на сайт: уровень 1 активен (50% базовых очков).",
    "ka": "✅ Telegram-ის ვერიფიკაცია დაფიქსირდა. დაბრუნდით საიტზე: დონე 1 აქტიურია (საბაზისო ქულების 50%).",
    "hy": "✅ Telegram-ի ստուգումը գրանցված է։ Վերադարձեք կայք՝ մակարդակ 1-ն ակտիվ է (հիմնական միավորների 50%)։",
    "uk": "✅ Верифікацію Telegram записано. Поверніться на сайт: рівень 1 активний (50% базових балів)."
  },
  "phoneTaken": {
    "en": "This phone number is already linked to another founder.",
    "es": "Este número ya está vinculado a otro fundador.",
    "pt": "Este número já está vinculado a outro fundador.",
    "fr": "Ce numéro est déjà lié à un autre fondateur.",
    "de": "Diese Nummer ist bereits mit einem anderen Gründer verknüpft.",
    "it": "Questo numero è già collegato a un altro fondatore.",
    "tr": "Bu numara zaten başka bir kurucuya bağlı.",
    "vi": "Số điện thoại này đã được liên kết với một nhà sáng lập khác.",
    "id": "Nomor ini sudah terhubung dengan pendiri lain.",
    "zh": "该手机号已绑定其他创始人。",
    "ar": "هذا الرقم مرتبط بالفعل بمؤسس آخر.",
    "ru": "Этот номер уже привязан к другому основателю.",
    "ka": "ეს ნომერი უკვე დაკავშირებულია სხვა დამფუძნებელთან.",
    "hy": "Այս համարն արդեն կապված է այլ հիմնադրի հետ։",
    "uk": "Цей номер уже прив'язаний до іншого засновника."
  },
  "telegramTaken": {
    "en": "This Telegram account is already linked to another founder.",
    "es": "Esta cuenta de Telegram ya está vinculada a otro fundador.",
    "pt": "Esta conta do Telegram já está vinculada a outro fundador.",
    "fr": "Ce compte Telegram est déjà lié à un autre fondateur.",
    "de": "Dieses Telegram-Konto ist bereits mit einem anderen Gründer verknüpft.",
    "it": "Questo account Telegram è già collegato a un altro fondatore.",
    "tr": "Bu Telegram hesabı zaten başka bir kurucuya bağlı.",
    "vi": "Tài khoản Telegram này đã được liên kết với một nhà sáng lập khác.",
    "id": "Akun Telegram ini sudah terhubung dengan pendiri lain.",
    "zh": "该 Telegram 账号已绑定其他创始人。",
    "ar": "حساب Telegram هذا مرتبط بالفعل بمؤسس آخر.",
    "ru": "Этот аккаунт Telegram уже привязан к другому основателю.",
    "ka": "ეს Telegram ანგარიში უკვე დაკავშირებულია სხვა დამფუძნებელთან.",
    "hy": "Այս Telegram հաշիվն արդեն կապված է այլ հիմնադրի հետ։",
    "uk": "Цей акаунт Telegram уже прив'язаний до іншого засновника."
  },
  "wrongContact": {
    "en": "Please share your own number with the «📱 Share phone number» button, not someone else's contact.",
    "es": "Comparte tu propio número con el botón «📱 Compartir número», no el contacto de otra persona.",
    "pt": "Compartilhe o seu próprio número com o botão «📱 Compartilhar número», não o contato de outra pessoa.",
    "fr": "Partagez votre propre numéro avec le bouton « 📱 Partager mon numéro », pas le contact de quelqu'un d'autre.",
    "de": "Teile deine eigene Nummer über den Button «📱 Nummer teilen», nicht den Kontakt einer anderen Person.",
    "it": "Condividi il tuo numero con il pulsante «📱 Condividi numero», non il contatto di un'altra persona.",
    "tr": "Başkasının kişisini değil, «📱 Numarayı paylaş» düğmesiyle kendi numaranızı paylaşın.",
    "vi": "Hãy chia sẻ số của chính bạn bằng nút «📱 Chia sẻ số điện thoại», không phải liên hệ của người khác.",
    "id": "Bagikan nomor Anda sendiri dengan tombol «📱 Bagikan nomor», bukan kontak orang lain.",
    "zh": "请使用「📱 分享手机号」按钮分享您本人的号码，而不是他人的联系人。",
    "ar": "شارك رقمك أنت عبر زر «📱 مشاركة الرقم»، وليس جهة اتصال شخص آخر.",
    "ru": "Отправьте свой номер кнопкой «📱 Поделиться номером», а не чужой контакт.",
    "ka": "გააზიარეთ საკუთარი ნომერი ღილაკით «📱 ნომრის გაზიარება» და არა სხვისი კონტაქტი.",
    "hy": "Կիսվեք ձեր սեփական համարով «📱 Կիսվել համարով» կոճակով, ոչ թե ուրիշի կոնտակտով։",
    "uk": "Надішліть свій номер кнопкою «📱 Поділитися номером», а не чужий контакт."
  },
  "sessionExpired": {
    "en": "Session expired. Open the bot again from the Founders page on the site.",
    "es": "La sesión ha caducado. Abre el bot de nuevo desde la página de Fundadores del sitio.",
    "pt": "A sessão expirou. Abra o bot novamente pela página de Fundadores do site.",
    "fr": "Session expirée. Rouvrez le bot depuis la page Fondateurs du site.",
    "de": "Sitzung abgelaufen. Öffne den Bot erneut über die Gründer-Seite der Website.",
    "it": "Sessione scaduta. Riapri il bot dalla pagina Fondatori del sito.",
    "tr": "Oturumun süresi doldu. Botu sitedeki Kurucular sayfasından yeniden açın.",
    "vi": "Phiên đã hết hạn. Hãy mở lại bot từ trang Nhà sáng lập trên trang web.",
    "id": "Sesi kedaluwarsa. Buka bot lagi dari halaman Pendiri di situs.",
    "zh": "会话已过期。请从网站的创始人页面重新打开机器人。",
    "ar": "انتهت الجلسة. افتح البوت مجددًا من صفحة المؤسسين على الموقع.",
    "ru": "Сессия истекла. Откройте бота снова со страницы основателей на сайте.",
    "ka": "სესიის ვადა ამოიწურა. ხელახლა გახსენით ბოტი საიტის დამფუძნებლების გვერდიდან.",
    "hy": "Սեսիայի ժամկետը լրացել է։ Կրկին բացեք բոտը կայքի Հիմնադիրներ էջից։",
    "uk": "Сесія закінчилася. Відкрийте бота знову зі сторінки засновників на сайті."
  },
  "alreadyVerified": {
    "en": "✅ Telegram verification is already complete for this account.",
    "es": "✅ La verificación de Telegram ya está completada para esta cuenta.",
    "pt": "✅ A verificação do Telegram já foi concluída para esta conta.",
    "fr": "✅ La vérification Telegram est déjà effectuée pour ce compte.",
    "de": "✅ Die Telegram-Verifizierung ist für dieses Konto bereits abgeschlossen.",
    "it": "✅ La verifica Telegram è già completata per questo account.",
    "tr": "✅ Bu hesap için Telegram doğrulaması zaten tamamlandı.",
    "vi": "✅ Tài khoản này đã hoàn tất xác minh Telegram.",
    "id": "✅ Verifikasi Telegram untuk akun ini sudah selesai.",
    "zh": "✅ 该账号已完成 Telegram 验证。",
    "ar": "✅ اكتمل التحقق عبر Telegram لهذا الحساب بالفعل.",
    "ru": "✅ Верификация Telegram для этого аккаунта уже выполнена.",
    "ka": "✅ ამ ანგარიშისთვის Telegram-ის ვერიფიკაცია უკვე დასრულებულია.",
    "hy": "✅ Այս հաշվի համար Telegram-ի ստուգումն արդեն ավարտված է։",
    "uk": "✅ Верифікацію Telegram для цього акаунта вже виконано."
  }
};

export type TelegramBotMessageKey =
  | "sharePhonePrompt"
  | "sharePhoneButton"
  | "invalidLink"
  | "success"
  | "phoneTaken"
  | "telegramTaken"
  | "wrongContact"
  | "sessionExpired"
  | "alreadyVerified";

export function tgMsg(key: TelegramBotMessageKey, locale: TelegramBotLocale): string {
  return MESSAGES[key][locale] ?? MESSAGES[key].en;
}
