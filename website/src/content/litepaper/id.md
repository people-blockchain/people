---
title: "People Blockchain — Litepaper"
description: "Blockchain di mana setiap pengguna adalah manusia yang terverifikasi. Dimiliki oleh orang-orang, bukan VC."
slug: /litepaper
version: "1.1"
date: 2026-10
status: public-draft
---

# People Blockchain — Litepaper

> **Blockchain di mana setiap pengguna adalah manusia yang terverifikasi.**
> **Dimiliki oleh orang-orang, bukan VC.**

*v1.1 · Oktober 2026 · Angka-angka bersifat awal dan dapat berubah sesuai tata kelola komunitas. Tidak ada janji penghasilan dalam dokumen ini.*

---

## Sekilas

| | |
|---|---|
| Pasokan | **1.000.000.000 PPL**, tetap |
| Setiap token yang diluncurkan | **10%** dari pasokan masuk ke pool komunitas token itu sendiri |
| Biaya jaringan terbakar | **0%** — setiap biaya dibagikan |
| Siapa yang mendapat hadiah | **Manusia terverifikasi** (Telegram dengan nomor ponsel atau Human Passport) |
| Pendanaan | **Pendanaan mandiri.** Tanpa VC. Tanpa alokasi investor. |
| Jaringan hari ini | Testnet publik — Cosmos EVM, chain id `people_97401-1` / EVM `97401` |

---

## 1. Masalahnya

**Crypto dibangun untuk orang-orang dalam.** Sebagian besar chain mengasumsikan Anda dapat membaca kode, mengelola frasa awal, dan mendeteksi scam sendiri.

**Bot mendapat hadiah.** Airdrop dan program hadiah diambil oleh skrip dan akun palsu. Orang nyata mendapat sangat sedikit.

**Peluncuran menguntungkan paus.** Putaran pribadi dan alokasi orang dalam berarti komunitas sering datang terakhir dan membayar harga tertinggi.

## 2. Jawaban kami

**Blockchain untuk orang biasa.** Ponsel atau browser sudah cukup. Luncurkan token, cetak kartu klub atau kumpulkan uang untuk ide — dengan formulir, bukan kode.

**Manusia terverifikasi, bukan bot.** Hadiah pergi ke akun yang lulus pemeriksaan manusia gratis. Satu orang, satu akun. Pendaftaran saja tidak menghasilkan apa pun.

**10% dari setiap token yang diluncurkan masuk ke komunitasnya.** Dibangun ke dalam protokol, bukan dijanjikan di posting: setiap peluncuran standar mengirim 10% dari pasokannya ke pool komunitas token itu sendiri. Ini tidak pernah dicampur dengan biaya jaringan.

---

## 3. Produk

Apa yang dapat Anda lakukan tanpa kode:

| Alat | Apa yang dilakukannya | Status |
|---|---|---|
| **Token tanpa kode** | Nama, ticker, gambar, pasokan. Token aktif di kurva bonding-nya sendiri; perdagangan pertama menetapkan harga. 10% dari pasokan masuk ke pool komunitas token; bagian kreator vests selama 180 hari. | Aktif di testnet |
| **Kartu klub NFT** | Kartu keanggotaan untuk klub, kafe, atau komunitas — satu per anggota, dengan gambar yang Anda unggah atau hasilkan. | Aktif di testnet |
| **Penggalangan dana** | Kumpulkan dukungan untuk proyek dengan template kontrak yang ditinjau: escrow, vesting, token-weighted vote. Komunitas Anda membeli di kurva, jadi permintaan menetapkan harga — bukan putaran pribadi. | Aktif di testnet |
| **Kontrak AI** | Jelaskan kontrak pintar dalam kata-kata polos. Ini dirakit dari template OpenZeppelin dan Anda melihat hasilnya sebelum Anda deploy. | Aktif di testnet |
| **Agen AI komunitas** | Agen yang bekerja untuk grup: dompet komunitas multisig dengan batasan pengeluaran, whitelist, dan pembekuan darurat. Parameter berubah hanya melalui suara token; setiap tindakan terlihat di explorer. | Testnet: 1 agen komunitas aktif |

---

## 4. Teknologi

**Cosmos EVM.** People berjalan di stack Cosmos EVM: kontrak pintar yang kompatibel dengan Ethereum dan alamat 0x di chain Cosmos.

| Parameter | Nilai |
|---|---|
| Cosmos chain id | `people_97401-1` |
| EVM chain id | `97401` |
| Koin asli | PPL (base denom `appl`, 18 decimals) |
| Prefiks alamat | `people1…` (dan akun yang sama seperti `0x…` di EVM) |
| Status jaringan | Testnet publik — bukan mainnet |

**Validator.** Validator menjalankan jaringan dan dibayar dari pool validator pra-alokasi ditambah 30% dari setiap biaya jaringan. Validator testnet berjalan untuk pengujian saja; pembukaan validasi dan staking ke publik adalah tahap roadmap yang lebih lambat.

**Verifikasi — satu pemeriksaan bahwa Anda adalah orang.** Gratis, dilakukan sekali:

- **Level 1 — Telegram:** bagikan nomor ponsel Anda sekali di bot Telegram kami. Satu nomor per founder. Mendapat 50% dari poin dasar.
- **Level 2 — Human Passport:** verifikasi dengan Human Passport. Mendapat 100% dari poin dasar.
- **Tanpa verifikasi, tanpa poin.** Tidak ada poin founder di testnet dan tidak ada hadiah PPL pribadi di mainnet tanpa itu.

---

## 5. Tokenomika

**Pasokan tetap: 1.000.000.000 PPL.** Tahun 1–4: inflasi 0%. Mulai tahun ke-5, emisi baru apa pun dibatasi pada 2% per tahun dan hanya melalui suara komunitas.

### Alokasi Genesis

| Ember | Bagian | PPL |
|---|---:|---:|
| Komunitas & hadiah | 35% | 350.000.000 |
| Validator & staking | 20% | 200.000.000 |
| Tim & founder | 15% | 150.000.000 |
| Ekosistem treasury (DAO) | 15% | 150.000.000 |
| Penjualan komunitas | 10% | 100.000.000 |
| Likuiditas | 5% | 50.000.000 |

- **Vesting tim & founder (15% dari pasokan):** 0% saat peluncuran, 6 bulan cliff, kemudian 18 bulan linear (24 bulan total).
- **Tidak ada ember investor.** Tidak ada alokasi VC atau putaran pribadi.
- **Hadiah berasal dari pool yang ada.** Founder, bounty, ambassador, dan airdrop dibayar hanya dari bucket Komunitas & hadiah. Tidak ada koin baru yang dicetak untuk mereka.

### Pembagian biaya jaringan

Setiap biaya protokol, termasuk biaya fraksional, dibagi dengan cara yang sama:

| Penerima | Bagian |
|---|---:|
| Validator | 30% |
| Pool komunitas | 25% |
| Treasury | 20% |
| Likuiditas | 10% |
| Pool pertumbuhan | 15% |
| Terbakar | 0% |

**Aliran biaya.** 100% dari biaya peluncuran token dan NFT (USDC/USDT) masuk ke pembelian kembali PPL publik. 30% dari biaya jaringan masuk ke pembelian kembali PPL publik (treasury 20% + likuiditas 10%). Sisa 70% dari biaya jaringan masuk ke validator (30%), community pool (25%) dan Growth Pool (15%). Semuanya pada akhirnya kembali ke peserta. Tidak ada yang dibakar untuk memalsukan kelangkaan.

**Biaya peluncuran token.** Aktif di testnet: pabrik yang telah diterapkan masih mengenakan biaya tetap dalam PPL — 1,045005 PPL untuk meluncurkan token dan 2,925 PPL untuk mencetak NFT. Rencana yang disetujui adalah biaya tetap **1 USD per peluncuran token dan 2 USD per mint NFT**, dapat dibayar dalam PPL, USDT, atau USDC, dengan diskon 20% saat membayar dalam PPL pada harga TWAP. Opsi stablecoin dan diskon TWAP belum ada dalam kode yang diterapkan. 100% dari biaya peluncuran token dan NFT (USDC/USDT) masuk ke pembelian kembali PPL publik, dan PPL yang dibeli kembali dibagi 30/25/20/10/15 oleh multisig treasury, sama seperti setiap pembelian kembali lainnya.

---

## 6. Satu Juta Founder

**Jadilah salah satu dari satu juta orang pertama yang terverifikasi.** Dapatkan nomor founder, ajak teman dan dapatkan poin ketika *mereka* melakukan hal nyata di jaringan.

**Poin berasal dari tindakan nyata, bukan pendaftaran.** Anda mendapatkan poin undangan hanya setelah pihak yang diundang Anda telah terverifikasi, membuat dompet, dan melakukan setidaknya satu tindakan testnet nyata (swap, liquidity pool, NFT mint, peluncuran token, atau suara tata kelola). Pendaftaran saja = 0.

**Bagaimana poin menjadi PPL:**

> **PPL per poin = pool musiman ÷ semua poin yang diperoleh dalam musim**

- **Pool musim 1:** 6.000.000 PPL, dibayar dari pool Satu Juta Founder yang ada. Tidak ada koin baru. Ketika pool kosong, program berhenti.
- **Pembayaran:** 10% sekaligus, 90% sisanya dalam irisan mingguan yang sama selama 52 minggu.
- **Anti-farming:** dua tingkat referral saja, batas per musim pada undangan aktif, dan clawback poin dari akun yang ditandai sebagai bot.

*Awal. Poin, tingkat PPL-per-poin, dan anggaran musim dapat berubah sebelum mainnet. Bukan janji penghasilan.*

---

## 7. Roadmap

| Tahap | Apa yang terjadi | Gerbang |
|---|---|---|
| **Musim 0 — Testnet publik** | Dompet, verifikasi, peluncuran token, kartu NFT, swap, poin Satu Juta Founder. | Sekarang |
| **Mainnet + penjualan PPL** | Mainnet diluncurkan. Parameter dipublikasikan (kurva eksponensial dari **$0.005**/PPL, hingga **100M PPL** di kurva; penjualan berakhir saat habis atau setelah **24 bulan**) di `/buy`; pembelian nonaktif hingga hub di-deploy. | Minimal 1.000 orang terverifikasi **dan** multisig treasury aktif |
| **Staking & validator** | Staking dan partisipasi validator terbuka di luar proyek. | Setelah mainnet |

Tidak ada tanggal yang dijanjikan. Setiap tahap dimulai ketika gerbangnya terpenuhi.

---

## 8. Tim & pendanaan

- **Anonim sesuai pilihan.** Tim kecil. Kami menerbitkan pekerjaan, kode, dan aturan, bukan wajah.
- **Pendanaan mandiri.** Tidak ada uang VC. Tidak ada alokasi investor. Tidak ada putaran pribadi.
- **Aturan yang sama seperti semua orang.** Tim's 15% vests: 0% saat peluncuran, 6 bulan cliff, kemudian 18 bulan linear (24 bulan total). Tidak ada baris tim dalam pembagian biaya jaringan.

---

## 9. Keamanan

- **Audited by: Claude Opus 5.5, GPT Astra, Fable 5.1.** Bug bounty on every page.
- **Multisig treasury.** Treasury dikendalikan oleh kontrak multisig 2-dari-3 milik People sendiri di jaringan People, dibuat sebelum mainnet; alamat penanda tangan akan dipublikasikan.
- **Alamat yang dipublikasikan.** Alamat penjualan, vesting, dan kontrak likuiditas akan dipublikasikan saat peluncuran mainnet — tidak ada placeholder.
- **Pertahanan bot.** Verifikasi manusia, batas per-perangkat dan per-IP, batas poin harian, dan clawback bot.
- **Blok bangunan yang terbukti.** Kontrak tanpa kode dirakit dari template OpenZeppelin.

---

## 10. Risiko & penolakan tanggung jawab

- **Bukan janji penghasilan.** PPL, poin, dan hadiah bukan produk investasi. Tidak ada di sini yang menjanjikan keuntungan, hasil, atau return.
- **Harga dapat turun ke nol.** Harga token bisa naik, turun, atau ke nol.
- **Testnet bukan mainnet.** Token testnet dan saldo tidak memiliki nilai. Poin adalah catatan aktivitas, bukan jaminan pembayaran.
- **Semuanya awal.** Angka, jadwal, dan aturan dapat berubah sebelum mainnet dan tunduk pada tata kelola komunitas.
- **Risiko teknologi.** Perangkat lunak dapat memiliki bug. Audit mengurangi risiko; itu tidak menghilangkannya.
- **Regulasi.** Aturan berbeda per negara dan dapat berubah. Parameter penjualan PPL ada di `/buy` (kurva dari **$0.005**/PPL); pembelian tetap nonaktif hingga hub di-deploy. Tidak ada KYC atau pemeriksaan kelayakan di situs ini.
- **Lakukan riset sendiri.** Litepaper ini adalah informasi, bukan saran keuangan, hukum, atau pajak.

---

## Bagaimana kami berbeda

Hanya fakta publik yang dapat diverifikasi tentang jaringan lain. Sumber di bawah.

| | Ethereum | Solana | People |
|---|---|---|---|
| Biaya terbakar | Biaya dasar terbakar ¹ | 50% dari biaya dasar terbakar ² | **0% terbakar** |
| Siapa yang menerima biaya | Validator mendapat biaya prioritas (tip) ¹ | Validator mendapat 50% dari biaya dasar dan 100% dari biaya prioritas ² | **Validator 30 · Komunitas 25 · Treasury 20 · Likuiditas 10 · Pertumbuhan 15** |
| Pendanaan awal | Penjualan ether publik, 2014 (42 hari, dibayar dalam BTC) ³ | Putaran Seri A $20M yang dipimpin oleh Multicoin Capital (2019); investor menerima token SOL ⁴ | **Pendanaan mandiri. Tanpa VC, tanpa alokasi investor** |
| Pembuatan akun | Membuat akun tidak memerlukan biaya; tidak ada pemeriksaan identitas ⁵ | Bukan persyaratan protokol | **Hadiah hanya untuk manusia terverifikasi** |
| Bagian komunitas token baru | Bukan aturan protokol | Bukan aturan protokol | **10% dari setiap token yang diluncurkan** |

1. ethereum.org — Gas and fees: https://ethereum.org/en/developers/docs/gas/
2. solana.com — Fees: https://solana.com/docs/core/fees
3. ethereum.org — History (2014 Ether sale): https://ethereum.org/en/history/
4. Solana Labs, "Solana Completes $20 Million Raise Led by Multicoin Capital" (30 Jul 2019): https://medium.com/solana-labs/solana-completes-20-million-raise-led-by-multicoin-capital-3d7f939475b6 · CoinDesk (30 Jul 2019): https://www.coindesk.com/markets/2019/07/30/multicoin-leads-20-million-round-for-speed-focused-solana
5. ethereum.org — Accounts: https://ethereum.org/en/developers/docs/accounts/

*Sumber diperiksa Oktober 2026. "Bukan aturan/persyaratan protokol" berarti dokumentasi yang dikutip tidak menjelaskan aturan seperti itu. Ini membandingkan pilihan desain, bukan kualitas.*

---

## Tautan

- Website: https://peopleblockchain.network
- Million Founders: https://peopleblockchain.network/founders
- Litepaper: https://peopleblockchain.network/litepaper
- Telegram: https://t.me/people_blockchain
- X: https://x.com/Peoplebchain
- YouTube: https://www.youtube.com/@PeoplesBlockchain

---

### Apa yang berubah di v1.1

- Bagian komunitas dari token baru adalah **10%** dari pasokan: **10%** dialokasikan saat peluncuran.
- Vesting tim adalah **0% saat peluncuran, cliff 6 bulan, lalu 18 bulan linear** (total 24 bulan).
- Biaya peluncuran: rencana yang disetujui adalah biaya tetap **1 USD per peluncuran token dan 2 USD per mint NFT**, dapat dibayar dalam PPL, USDT, atau USDC, dengan diskon 20% saat membayar dalam PPL pada harga TWAP; pabrik yang telah diterapkan masih mengenakan biaya PPL tetap.
- **Penjualan komunitas PPL** memakai kurva eksponensial yang dipublikasikan di `/buy` (mulai **$0.005**/PPL; harga dan batas publik; beli nonaktif hingga hub). Tidak ada KYC atau pemeriksaan kelayakan di situs ini.
- Keamanan: **Audited by: Claude Opus 5.5, GPT Astra, Fable 5.1**; bug bounty on every page.
- Multisig treasury adalah **2 dari 3** dan dibuat sebelum mainnet.
- Jika kurva token tidak habis terjual dalam **180 hari** sejak peluncuran, siapa pun dapat memfinalisasinya dan token yang tidak terjual masuk ke pool komunitas token tersebut. Kurva yang habis terjual tetap pindah ke likuiditas seperti sebelumnya. (Aktif di testnet.)
- Penjualan PPL, setelah dibuka, berjalan sampai semua PPL terjual atau selama **24 bulan**, mana yang lebih dulu. Jangka waktu tetap dan tidak akan diperpanjang. Setelah itu siapa pun dapat memfinalisasinya; PPL tidak terjual masuk ke kolam komunitas, tidak ada pengembalian dana. Sampai saat itu disimpan di multisig proyek dan tim tidak menyentuhnya.
