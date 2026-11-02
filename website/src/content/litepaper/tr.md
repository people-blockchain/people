---
title: "PEOPLE Blockchain — Litepaper"
description: "Herbir kullanıcının doğrulanmış bir gerçek kişi olduğu blokzincir. İnsanların sahip olduğu, VC'lerin değil."
slug: /litepaper
version: "1.1"
date: 2026-10
status: public-draft
---

# PEOPLE Blockchain — Litepaper

> **Herbir kullanıcının doğrulanmış bir gerçek kişi olduğu blokzincir.**
> **İnsanların sahip olduğu, VC'lerin değil.**

*v1.1 · Ekim 2026 · Rakamlar ön niteliktedir ve topluluk yönetişimine tabidir. Bu belgede hiçbir şey gelir vaadi değildir.*

---

## Bir bakışta

| | |
|---|---|
| Arz | **1.000.000.000 PPL**, sabit |
| Başlatılan her token | **%10'si**, o token'ın kendi topluluk havuzuna gider |
| Yakılan ağ ücretleri | **%0** — her ücret paylaşılır |
| Ödül kazanan | **Doğrulanmış insanlar** (Telegram telefon veya Human Passport) |
| Finansman | **Kendi finansmanı.** VC yok. Yatırımcı tahsisi yok. |
| Bugün ağ | Halka açık **testnet** — Cosmos EVM, zincir kimliği `people_97401-1` / EVM `97401` |

---

## 1. Sorun

**Kripto içeridekiler için inşa edildi.** Çoğu zincir, kodu okuyabildiğinizi, tohum ifadelerini yönetebileceğinizi ve dolandırıcılığı kendi başınıza tespit edebileceğinizi varsayar.

**Botlar ödülleri alır.** Airdrop ve ödül programları komut dosyaları ve sahte hesaplarla çiftçilik yapılır. Gerçek insanlar çok az bir pay alır.

**Başlatmalar balinalara uygun.** Özel turlar ve içerideki tahsisler, topluluğun genellikle son gelmesini ve en yüksek fiyatı ödemesini ifade eder.

## 2. Bizim cevabımız

**Sıradan insanlar için bir blokzincir.** Bir telefon veya tarayıcı yeterlidir. Bir token başlatın, kulüp kartları basın veya bir fikir için para toplayın — kod değil, bir formla.

**Botlar değil, doğrulanmış insanlar.** Ödüller, ücretsiz bir insan kontrolünü geçen hesaplara gider. Bir kişi, bir hesap. Kayıt tek başına hiçbir şey kazanmaz.

**Başlatılan her token'ın %10'si topluluğa gider.** Bir yazıda vaat edilmez, protokole yerleştirilir: her standart başlatma, arzının %10'sini o token'ın kendi topluluk havuzuna gönderir. Hiçbir zaman ağ ücretleriyle karıştırılmaz.

---

## 3. Ürün

Kod olmadan yapabileceğiniz şeyler:

| Araç | Ne yaptığı | Durum |
|---|---|---|
| **Kod gerektirmeyen tokenler** | Ad, işaret, görüntü, arz. Token kendi bağlanma eğrisinde canlı yayına gider; ilk ticaret fiyatı belirler. Arzının %10'si token'ın topluluk havuzuna gider; yaratıcının payı 180 gün içinde hak ediş yapılır. | Testnet'te canlı |
| **NFT kulüp kartları** | Bir kulüp, kafe veya topluluk için üyelik kartları — üye başına bir tane, yüklediğiniz veya oluşturduğunuz bir görüntüyle. | Testnet'te canlı |
| **Fon toplama** | İncelenen sözleşme şablonlarıyla bir proje için destek toplayın: emanet, hak ediş, token ağırlıklı oylama. Topluluğunuz eğride satın alır, bu nedenle talep fiyatı belirler — özel bir tur değil. | Testnet'te canlı |
| **Yapay zeka sözleşmeleri** | Bir akıllı sözleşmeyi düz sözcüklerle açıklayın. OpenZeppelin şablonlarından birleştirilir ve dağıtmadan önce sonucu görürsünüz. | Testnet'te canlı |
| **Topluluk yapay zeka ajanları** | Bir grup için çalışan ajanlar: harcama sınırları, beyaz listeler ve acil durum dondurması olan multisig bir topluluk cüzdanı. Parametreler yalnızca token oyu tarafından değişir; her işlem explorer'da görünür. | Testnet: 1 topluluk ajanı aktif |

---

## 4. Teknoloji

**Cosmos EVM.** PEOPLE, Cosmos EVM yığınında çalışır: Ethereum uyumlu akıllı sözleşmeler ve Cosmos zincirinde 0x adresleri.

| Parametre | Değer |
|---|---|
| Cosmos zincir kimliği | `people_97401-1` |
| EVM zincir kimliği | `97401` |
| Yerel madeni para | PPL (temel denom `appl`, 18 ondalık) |
| Adres öneki | `people1…` (ve EVM'de aynı hesap olarak `0x…`) |
| Ağ durumu | Halka açık testnet — mainnet değil |

**Doğrulayıcılar.** Doğrulayıcılar ağı çalıştırır ve önceden tahsis edilen doğrulayıcı havuzundan artı her ağ ücretinin %30'undan ödeme alırlar. Testnet doğrulayıcıları yalnızca test için çalışır; doğrulama ve hisse senedi halka açmak daha sonraki bir yol haritası aşamasıdır.

**Doğrulama — bir kişi olduğunuzu gösteren tek bir kontrol.** Ücretsiz, bir kez yapılır:

- **Seviye 1 — Telegram:** Telegram botumuzda telefon numaranızı bir kez paylaşın. Kurucuya bir numara. Temel puanların %50'sini kazanır.
- **Seviye 2 — Human Passport:** Human Passport ile doğrulayın. Temel puanların %100'ünü kazanır.
- **Doğrulama yok, puan yok.** Testnet'te kurucu puanı yok ve mainnet'te doğrulama olmadan kişisel PPL ödülleri yok.

---

## 5. Token ekonomisi

**Sabit arz: 1.000.000.000 PPL.** 1-4. yıllar: %0 enflasyon. 5. yıldan itibaren, herhangi bir yeni emisyon yıllık %2 ile sınırlandırılır ve yalnızca topluluk oyuyla.

### Başlangıç tahsisi

| Kova | Pay | PPL |
|---|---:|---:|
| Topluluk ve ödüller | %35 | 350.000.000 |
| Doğrulayıcılar ve hisse senedi | %20 | 200.000.000 |
| Takım ve kurucular | %15 | 150.000.000 |
| Ekosistem hazinesi (DAO) | %15 | 150.000.000 |
| Topluluk satışı | %10 | 100.000.000 |
| Likidite | %5 | 50.000.000 |

- **Takım ve kurucu hak ediş (%15 arz):** Başlangıçta %0, 6 aylık cliff, sonra 18 ay doğrusal (toplam 24 ay).
- **Yatırımcı kova yok.** VC veya özel tur tahsisi yoktur.
- **Ödüller mevcut havuzlardan gelir.** Kurucular, bounty'ler, elçiler ve airdroplar yalnızca Topluluk ve ödüller kovası'ndan ödenir. Bunlar için hiçbir yeni madeni para basılmaz.

### Ağ ücreti bölünüşü

Her protokol ücreti, kesirli ücretler dahil, aynı şekilde bölünür:

| Alıcı | Pay |
|---|---:|
| Doğrulayıcılar | %30 |
| Topluluk havuzu | %25 |
| Hazine | %20 |
| Likidite | %10 |
| Büyüme Havuzu | %15 |
| Yakma | %0 |

**Ücret akışı.** Token ve NFT lansman ücretlerinin %100'ü (USDC/USDT) halka açık PPL geri alımlarına gider. Ağ ücretlerinin %30'u halka açık PPL geri alımlarına gider (hazine %20 + likidite %10). Ağ ücretlerinin kalan %70'i doğrulayıcılara (%30), topluluk havuzuna (%25) ve Growth Pool'a (%15) gider. Hepsi nihayetinde katılımcılara geri döner. Sahte kıtlık yaratmak için hiçbir şey yakılmaz.

**Token başlatma ücreti.** Test ağında canlı: kurulu fabrikalar hâlâ sabit bir PPL ücreti almaktadır — bir token başlatmak için 1,045005 PPL ve NFT basmak için 2,925 PPL. Onaylanan plan, **token lansmanı için 1 USD ve NFT mint için 2 USD** sabit ücret olup PPL, USDT veya USDC ile ödenebilir ve PPL ile TWAP fiyatından ödemede %20 indirim uygulanır. Stabil coin seçeneği ve TWAP indirimi henüz kurulu kodda yoktur. Token ve NFT lansman ücretlerinin %100'ü (USDC/USDT) halka açık PPL geri alımlarına gider ve geri alınan PPL, diğer tüm geri alımlarda olduğu gibi hazine multisig'i tarafından 30/25/20/10/15 olarak bölünür.

---

## 6. Milyon Kurucusu

**İlk milyon doğrulanmış kişisinden biri olun.** Kurucu numarası alın, arkadaşlarını davet edin ve ağda gerçek şeyler yaptıklarında puan kazanın.

**Puanlar kayıtlardan değil, gerçek eylemlerden gelir.** Davetlininiz doğrulandıktan, cüzdan oluşturduktan ve en az bir gerçek testnet eylemi (takas, likidite havuzu, NFT basımı, token başlatması veya yönetim oylaması) yaptıktan sonra sadece davet puanları kazanırsınız. Kayıt tek başına = 0.

**Puanlar PPL'ye nasıl dönüşür:**

> **Puan başına PPL = sezon havuzu ÷ sezon içinde kazanılan tüm puanlar**

- **Sezon 1 havuzu:** Mevcut Milyon Kurucusu havuzundan ödenen 6.000.000 PPL. Yeni madeni para yok. Havuz boşaldığında, program durur.
- **Ödeme:** Hemen %10, kalan %90 52 hafta içinde eşit haftalık dilimler halinde.
- **Anti-çiftçilik:** sadece iki yönlü davet, sezon başına aktif davetlilerde bir ürün sınırlaması ve bot olarak işaretlenen hesaplardan puan geri alma.

*Ön nitelik. Puanlar, puan başına PPL oranı ve sezon bütçesi mainnet'ten önce değişebilir. Gelir vaadi değildir.*

**PEOPLE Genesis Quest (2 Kasım – 1 Aralık 2026).** PPL satışından önceki bir aylık kampanya. Aynı 50M'lik Million Founders havuzundan ödenir: 1. sezon 20M'den 15M'ye, tüm sezonların referans havuzu 15M'den 10M'ye iner (1. sezon referansları 6M'lerini korur). Toplam 50M kalır ve yeni PPL basılmaz.

- **Havuz:** 25.000.000 PPL'ye kadar. Ağda gerçek bir işlem yapan doğrulanmış kişiler için 13M (Telegram ile 300 PPL, Human Passport ile 1.500 PPL, kişi başı en fazla 3.000). Referanslar için 6M (Human Passport'u olan ve 7 gün sonra hâlâ aktif olan her davetli için 500 PPL, en fazla 20 davetli). İlk 100 sıralaması için 6M (1. sıra 500.000 PPL). Sosyal medya takibi zorunludur ama ödenmez.
- **Kilit açılışı:** 1 Mart 2027'ye kadar tamamen kilitli, sonra 1 Aralık 2027'ye kadar her ay 1/9. Her dokuzda bir pay yalnızca o ay ağda en az bir işlem yaptıysan açılır. Bu takvim Founders sezon ödüllerinden ayrıdır.
- **Geri alım yok:** proje quest PPL'lerini asla geri satın almaz. Geri alım sözleşmesi yalnızca satışta satın alınan PPL'leri kabul eder. Kilidi açılan quest PPL'leri transferler açıldığında katılımcılar arasında aktarılabilir.

---

## 7. Yol haritası

| Aşama | Ne olur | Kapı |
|---|---|---|
| **Sezon 0 — Halka açık testnet** | Cüzdanlar, doğrulama, token başlatmaları, NFT kartları, takaslalar, Milyon Kurucusu puanları. | Şimdi |
| **Base üzerinde PPL satışı** | PPL satışı yalnızca Base üzerinde yapılır (PplCurveHub, USDC veya USDT). Yayınlanan parametreler (üstel eğri **$0.005**/PPL'den, eğride **100M PPL**, **$4M** graduation) `/buy` sayfasında; satış sözleşmesi yayınlanana kadar alımlar kapalı. PEOPLE ağının mainnet'i ayrı bir adımdır. | Satış sözleşmesi (Base'te PplCurveHub) ve alıcı multisig yayınlandı |
| **Hisse senedi ve doğrulayıcılar** | Hisse senedi ve doğrulayıcı katılımı proje ötesinde açılır. | Mainnet'ten sonra |

Hiçbir tarih vaat edilmez. Her aşama, kapısı karşılandığında başlar.

---

## 8. Takım ve finansman

- **Seçime bağlı olarak anonim.** Küçük bir takım. İşleri, kodu ve kuralları yayınlarız, yüzleri değil.
- **Kendi finansmanı.** VC parası yok. Yatırımcı tahsisleri yok. Özel tur yok.
- **Herkes için aynı kurallar.** Takımın %15'i hak ediş yapılır: başlangıçta %0, 6 aylık cliff, sonra 18 ay doğrusal (toplam 24 ay). Ağ ücreti bölünüşünde takım satırı yoktur.

---

## 9. Güvenlik

- Yapay zekâ modelleri tarafından incelendi: Claude Opus 5.5, GPT Astra, Fable 5.1 (proje ekibi çalıştırdı). Bu bir güvenlik denetimi değildir. Henüz harici bir denetim yapılmadı. Bug bounty on every page.
- **Çoklu imza cüzdanları.** Ağ ücreti hazinesi: PEOPLE ağında 2/3 çoklu imza cüzdanı. Satış gelirleri: Base üzerindeki proje çoklu imza cüzdanı; adresi ve imza eşiği satış açılmadan önce yayımlanır.
- **Yayımlanan adresler.** Satış sözleşmesi ve alıcı çoklu imza cüzdanı satış açılmadan önce; vesting ve LP kilidi sözleşmeleri ağın tam lansmanında yayımlanır. Yer tutucu yok.
- **Bot savunması.** İnsan doğrulaması, cihaz başına ve IP başına sınırlamalar, günlük puan kapakları ve bot geri alma.
- **Kanıtlanmış yapı taşları.** Kod gerektirmeyen sözleşmeler OpenZeppelin şablonlarından birleştirilir.

---

## 10. Riskler ve feragatname

- **Gelir vaadi yok.** PPL, puanlar ve ödüller bir yatırım ürünü değildir. Burada hiçbir şey kar, getiri veya getiri vaat etmez.
- **Fiyatlar sıfıra gidebilir.** Token fiyatları yukarı, aşağı veya sıfıra gidebilir.
- **Testnet mainnet değil.** Testnet jetonları ve bakiyeleri hiçbir değere sahip değildir. Puanlar, ödeme garantisi değil, aktivitenin bir kaydıdır.
- **Her şey ön niteliklidir.** Rakamlar, zaman çizelgeleri ve kurallar mainnet'ten önce değişebilir ve topluluk yönetişimine tabidir.
- **Teknoloji riski.** Yazılımda hata olabilir. Bir denetim riski azaltır; bunu kaldırmaz.
- **Düzenleme.** Kurallar ülkeye göre değişir. PPL satış parametreleri `/buy` sayfasında (eğri **$0.005**/PPL'den); hub kontratı deploy edilene kadar alımlar kapalı. Bu sitede KYC veya uygunluk kontrolü yapılmaz.
- **Kendi araştırmanızı yapın.** Bu litepaper bilgidir, finansal, yasal veya vergi danışması değildir.

---

## Nasıl farklıyız

Yalnızca diğer ağlar hakkında doğrulanabilir halka açık gerçekler. Kaynaklar aşağıda.

| | Ethereum | Solana | PEOPLE |
|---|---|---|---|
| Yakılan ücretler | Temel ücret yakılır ¹ | Temel ücretin %50'si yakılır ² | **%0 yakılır** |
| Ücreti alan | Doğrulayıcılar öncelik ücretini (bahşiş) alır ¹ | Doğrulayıcılar temel ücretin %50'sini ve öncelik ücretinin %100'ünü alırlar ² | **Doğrulayıcılar 30 · Topluluk 25 · Hazine 20 · Likidite 10 · Büyüme 15** |
| Erken finansman | Halka açık eter satışı, 2014 (42 gün, BTC cinsinden ödendi) ³ | Multicoin Capital tarafından yönetilen 20 milyon dolar Series A (2019); yatırımcılar SOL jetonlarını aldılar ⁴ | **Kendi finansmanı. VC yok, yatırımcı tahsisi yok** |
| Hesap oluşturma | Hesap oluşturmak hiçbir şeye mal olmaz; kimlik denetimi yok ⁵ | Protokol gereksi değil | **Ödüller yalnızca doğrulanmış insanlar için** |
| Yeni token topluluk payı | Protokol kuralı değil | Protokol kuralı değil | **Başlatılan her token'ın %10'si** |

1. ethereum.org — Gaz ve ücretler: https://ethereum.org/en/developers/docs/gas/
2. solana.com — Ücretler: https://solana.com/docs/core/fees
3. ethereum.org — Tarih (2014 Ether satışı): https://ethereum.org/en/history/
4. Solana Labs, "Solana Completes $20 Million Raise Led by Multicoin Capital" (30 Temmuz 2019): https://medium.com/solana-labs/solana-completes-20-million-raise-led-by-multicoin-capital-3d7f939475b6 · CoinDesk (30 Temmuz 2019): https://www.coindesk.com/markets/2019/07/30/multicoin-leads-20-million-round-for-speed-focused-solana
5. ethereum.org — Hesaplar: https://ethereum.org/en/developers/docs/accounts/

*Kaynaklar Ekim 2026'da kontrol edilmiştir. "Protokol kuralı/gereksi değil" alıntı yapılan dokümantasyonun böyle bir kuralı tanımlamadığı anlamına gelir. Bu, tasarım seçimlerini karşılaştırır, kaliteyi değil.*

---

## Bağlantılar

- Website: https://www.peopleblockchain.network
- Million Founders: https://www.peopleblockchain.network/founders
- Litepaper: https://www.peopleblockchain.network/litepaper
- Telegram: https://t.me/people_blockchain
- X: https://x.com/Peoplebchain
- YouTube: https://www.youtube.com/@PeoplesBlockchain

---

### v1.1'da neler değişti

- Yeni bir token'ın topluluk payı arzın **%10'sidir**: lansmanda ayrılan **%10**.
- Ekip hak edişi **lansmanda %0, 6 aylık cliff, ardından 18 ay doğrusal** (toplam 24 ay).
- Başlatma ücretleri: onaylanan plan, **token lansmanı için 1 USD ve NFT mint için 2 USD** sabit ücret olup PPL, USDT veya USDC ile ödenebilir ve PPL ile TWAP fiyatından ödemede %20 indirim uygulanır; kurulu fabrikalar hâlâ sabit PPL ücreti almaktadır.
- **PPL topluluk satışı** `/buy` üzerindeki yayınlanmış üstel eğriyi kullanır (**$0.005**/PPL başlangıç; fiyatlar ve limitler açık; hub'a kadar alım kapalı). Bu sitede KYC veya uygunluk kontrolü yapılmaz.
- Güvenlik: Yapay zekâ modelleri tarafından incelendi: Claude Opus 5.5, GPT Astra, Fable 5.1 (proje ekibi çalıştırdı). Bu bir güvenlik denetimi değildir. Henüz harici bir denetim yapılmadı.; bug bounty on every page.
- Çoklu imza cüzdanları. Ağ ücreti hazinesi: PEOPLE ağında 2/3 çoklu imza cüzdanı. Satış gelirleri: Base üzerindeki proje çoklu imza cüzdanı; adresi ve imza eşiği satış açılmadan önce yayımlanır.
- Bir tokenın eğrisi lansmandan sonraki **180 gün** içinde tükenmezse herkes onu sonlandırabilir ve satılmayan tokenlar o tokenın topluluk havuzuna gider. Tükenen eğri eskisi gibi likiditeye geçer. (Test ağında canlı.)
- Satış, tükenene kadar (eğri $4M toplanınca kapanır) veya açılıştan itibaren 24 ay boyunca sürer; hangisi önce gerçekleşirse. Uzatma yoktur. Satılmayan PPL Community Pool'a gider. İade yoktur: her alım kesindir.
