---
title: "People Blockchain — Litepaper"
description: "La blockchain dove ogni utente è una persona verificata. Posseduta da persone, non da VC."
slug: /litepaper
version: "1.1"
date: 2026-10
status: public-draft
---

# People Blockchain — Litepaper

> **La blockchain dove ogni utente è una persona verificata.**
> **Posseduta da persone, non da VC.**

*v1.1 · Ottobre 2026 · I numeri sono preliminari e soggetti a governance comunitaria. Niente in questo documento è una promessa di reddito.*

---

## In breve

| | |
|---|---|
| Fornitura | **1.000.000.000 PPL**, fissa |
| Ogni token lanciato | **27%** della fornitura va al pool comunitario di quel token |
| Commissioni di rete bruciate | **0%** — ogni commissione è condivisa |
| Chi guadagna ricompense | **Persone verificate** (Telegram con numero di telefono o Human Passport) |
| Finanziamento | **Autofinanziato.** Nessun VC. Nessuna allocazione agli investitori. |
| Rete oggi | Testnet pubblico — Cosmos EVM, chain id `people_97401-1` / EVM `97401` |

---

## 1. Il problema

**La cripto è stata costruita per gli insider.** La maggior parte delle chain assume che tu possa leggere il codice, gestire frasi seed e riconoscere una truffa autonomamente.

**I bot ottengono le ricompense.** Gli airdrop e i programmi di ricompensa sono coltivati da script e account falsi. Le persone reali ottengono una frazione.

**I lanci favoriscono le balene.** I round privati e le allocazioni insider significano che la comunità spesso arriva per ultima e paga il prezzo più alto.

## 2. La nostra risposta

**Una blockchain per persone ordinarie.** Un telefono o un browser è sufficiente. Lancia un token, conia carte club o raccogli fondi per un'idea — con un modulo, non con il codice.

**Persone verificate, non bot.** Le ricompense vanno ad account che hanno superato un controllo umano gratuito. Una persona, un account. Solo l'iscrizione non guadagna nulla.

**Il 27% di ogni token lanciato va alla sua comunità.** Incorporato nel protocollo, non promesso in un post: ogni lancio standard invia il 27% della sua fornitura al pool comunitario di quel token. Non è mai mescolato con le commissioni di rete.

---

## 3. Prodotto

Quello che puoi fare senza codice:

| Strumento | Cosa fa | Stato |
|---|---|---|
| **Token senza codice** | Nome, ticker, immagine, fornitura. Il token entra in live sulla sua curva di bonding; il primo scambio fissa il prezzo. Il 27% della fornitura va al pool comunitario del token; la quota del creatore scade in 180 giorni. | Live on testnet |
| **Carte club NFT** | Carte di iscrizione per un club, un caffè o una comunità — una per membro, con un'immagine che carichi o generi. | Live on testnet |
| **Raccolta fondi** | Raccogli supporto per un progetto con modelli di contratti revisionati: escrow, vesting, voto ponderato per token. La tua comunità acquista sulla curva, quindi la domanda fissa il prezzo — non un round privato. | Live on testnet |
| **Contratti AI** | Descrivi un contratto intelligente a parole. Viene assemblato da modelli OpenZeppelin e vedi il risultato prima di distribuirlo. | Live on testnet |
| **Agenti AI comunitari** | Agenti che lavorano per un gruppo: un portafoglio comunitario multisig con limiti di spesa, whitelist e un blocco di emergenza. I parametri cambiano solo per voto del token; ogni azione è visibile nell'explorer. | Testnet: 1 agente comunitario attivo |

---

## 4. Tecnologia

**Cosmos EVM.** People funziona su uno stack Cosmos EVM: contratti intelligenti compatibili con Ethereum e indirizzi 0x su una chain Cosmos.

| Parametro | Valore |
|---|---|
| Id chain Cosmos | `people_97401-1` |
| Id chain EVM | `97401` |
| Moneta nativa | PPL (denom base `appl`, 18 decimali) |
| Prefisso indirizzo | `people1…` (e lo stesso account come `0x…` in EVM) |
| Stato della rete | Testnet pubblico — non mainnet |

**Validatori.** I validatori gestiscono la rete e vengono pagati dal pool pre-allocato dei validatori più il 30% di ogni commissione di rete. I validatori testnet funzionano solo per il test; l'apertura della validazione e dello staking al pubblico è una fase successiva della roadmap.

**Verifica — un controllo che sei una persona.** Gratuito, fatto una volta:

- **Livello 1 — Telegram:** condividi il tuo numero di telefono una volta nel nostro bot Telegram. Un numero per fondatore. Guadagna il 50% dei punti base.
- **Livello 2 — Human Passport:** verifica con Human Passport. Guadagna il 100% dei punti base.
- **Nessuna verifica, nessun punto.** Nessun punto fondatore su testnet e nessuna ricompensa PPL personale su mainnet senza di essa.

---

## 5. Tokenomics

**Fornitura fissa: 1.000.000.000 PPL.** Anni 1–4: inflazione 0%. Dal quinto anno, qualsiasi nuova emissione è limitata a 2% all'anno e solo per voto comunitario.

### Allocazione genesis

| Bucket | Quota | PPL |
|---|---:|---:|
| Community & rewards | 35% | 350.000.000 |
| Validators & staking | 20% | 200.000.000 |
| Team & founders | 15% | 150.000.000 |
| Ecosystem treasury (DAO) | 15% | 150.000.000 |
| Community sale | 10% | 100.000.000 |
| Liquidity | 5% | 50.000.000 |

- **Vesting team & founders (15% della fornitura):** 0% al lancio, cliff di 6 mesi, poi 18 mesi lineari (24 mesi totali).
- **Nessun bucket per investitori.** Non c'è nessuna allocazione VC o round privato.
- **Le ricompense provengono da pool esistenti.** Fondatori, bounty, ambasciatori e airdrop vengono pagati solo dal bucket Community & rewards. Non vengono coniate nuove monete per loro.

### Divisione commissioni di rete

Ogni commissione di protocollo, incluse le commissioni frazionarie, viene divisa nello stesso modo:

| Destinatario | Quota |
|---|---:|
| Validators | 30% |
| Community pool | 25% |
| Treasury | 20% |
| Liquidity | 10% |
| Growth Pool | 15% |
| Burn | 0% |

**Buyback.** Le quote del tesoro (20%) e della liquidità (10%) vengono utilizzate per i buyback pubblici di PPL. Niente viene bruciato per fingere scarsità — le commissioni tornano alla rete e alle sue persone.

**Commissione di lancio token.** Attiva sulla testnet: le factory distribuite applicano ancora una commissione fissa in PPL — 1,045005 PPL per lanciare un token e 2,925 PPL per coniare un NFT. Il piano approvato è un importo fisso di **1 USD per il lancio di un token e 2 USD per il mint di un NFT**, pagabile in PPL, USDT o USDC, con uno sconto del 20% pagando in PPL a un prezzo TWAP. L'opzione stablecoin e lo sconto TWAP non sono ancora nel codice distribuito. Il 100% delle commissioni di lancio va al riacquisto pubblico di PPL, e il PPL riacquistato viene diviso 30/25/20/10/15 dal multisig del tesoro, come ogni altro riacquisto.

---

## 6. Million Founders

**Sii uno dei primi milioni di persone verificate.** Ottieni un numero fondatore, invita amici e guadagna punti quando *loro* fanno cose reali sulla rete.

**I punti provengono da azioni reali, non da iscrizioni.** Guadagni punti di invito solo dopo che il tuo invitato si è verificato, ha creato un portafoglio e ha eseguito almeno un'azione testnet reale (swap, pool di liquidità, NFT mint, lancio di token o voto sulla governance). Solo l'iscrizione = 0.

**Come i punti diventano PPL:**

> **PPL per punto = pool stagionale ÷ tutti i punti guadagnati nella stagione**

- **Pool stagione 1:** 6.000.000 PPL, pagati dal pool Million Founders esistente. Nessuna moneta nuova. Quando il pool è vuoto, il programma si ferma.
- **Pagamento:** 10% in una volta, i restanti 90% in fette uguali settimanali per 52 settimane.
- **Anti-farming:** due livelli di referral solo, un limite per stagione sugli invitati attivi e clawback dei punti da account contrassegnati come bot.

*Preliminare. I punti, il tasso PPL-per-punto e il budget di stagione possono cambiare prima del mainnet. Non una promessa di reddito.*

---

## 7. Roadmap

| Fase | Cosa succede | Gate |
|---|---|---|
| **Stagione 0 — Testnet pubblico** | Portafogli, verifica, lanci di token, carte NFT, swap, punti Million Founders. | Ora |
| **Mainnet + vendita PPL** | Mainnet si avvia. La vendita PPL non è ancora aperta; aprirà solo quando esisterà un'entità giuridica operativa. | Almeno 1.000 persone verificate **e** un multisig del tesoro live |
| **Staking & validatori** | Staking e partecipazione dei validatori si aprono oltre il progetto. | Dopo mainnet |

Nessuna data è promessa. Ogni fase inizia quando il suo gate è soddisfatto.

---

## 8. Team & finanziamento

- **Anonimo per scelta.** Un piccolo team. Pubblichiamo lavoro, codice e regole, non volti.
- **Autofinanziato.** Nessun denaro VC. Nessuna allocazione agli investitori. Nessun round privato.
- **Stesse regole per tutti.** Il vesting del team è: 0% al lancio, cliff di 6 mesi, poi 18 mesi lineari (24 mesi totali). Non c'è nessuna riga team nella divisione delle commissioni di rete.

---

## 9. Sicurezza

- **Audit di sicurezza prima del mainnet.** I contratti di protocollo subiranno un audit di sicurezza prima del lancio del mainnet.
- **Treasury multisig.** Il tesoro è controllato dal contratto multisig 2-di-3 di People sulla rete People, creato prima del mainnet; gli indirizzi dei firmatari saranno pubblicati.
- **Indirizzi pubblicati.** Gli indirizzi dei contratti di vendita, vesting e liquidità saranno pubblicati al lancio del mainnet — nessun placeholder.
- **Difesa dai bot.** Verifica umana, limiti per dispositivo e per IP, limiti di punti giornalieri e clawback dei bot.
- **Building block provati.** I contratti senza codice vengono assemblati da modelli OpenZeppelin.

---

## 10. Rischi & disclaimer

- **Nessuna promessa di reddito.** PPL, punti e ricompense non sono un prodotto di investimento. Nulla qui promette profitto, rendimento o ritorni.
- **I prezzi possono andare a zero.** I prezzi dei token possono salire, scendere o andare a zero.
- **Testnet non è mainnet.** I token e i saldi testnet non hanno valore. I punti sono un record di attività, non una garanzia di pagamento.
- **Tutto è preliminare.** I numeri, gli orari e le regole possono cambiare prima del mainnet e sono soggetti a governance comunitaria.
- **Rischio tecnologico.** Il software può avere bug. Un audit riduce il rischio; non lo elimina.
- **Regolazione.** Le regole variano a seconda del paese e possono cambiare. Al momento non c'è alcuna vendita pubblica di PPL; non vengono eseguiti controlli KYC.
- **Fai la tua ricerca.** Questo litepaper è informazione, non consiglio finanziario, legale o fiscale.

---

## Come siamo diversi

Solo fatti pubblici verificabili su altre reti. Fonti di seguito.

| | Ethereum | Solana | People |
|---|---|---|---|
| Commissioni bruciate | La commissione base è bruciata ¹ | Il 50% della commissione base è bruciato ² | **0% bruciato** |
| Chi riceve le commissioni | I validatori ottengono la commissione prioritaria (mancia) ¹ | I validatori ottengono il 50% della commissione base e il 100% della commissione prioritaria ² | **Validatori 30 · Community 25 · Treasury 20 · Liquidity 10 · Growth 15** |
| Finanziamento iniziale | Vendita pubblica di ether, 2014 (42 giorni, pagati in BTC) ³ | $20M Series A guidato da Multicoin Capital (2019); gli investitori hanno ricevuto token SOL ⁴ | **Autofinanziato. Nessun VC, nessuna allocazione agli investitori** |
| Creazione account | La creazione di un account non costa nulla; nessun controllo di identità ⁵ | Non è un requisito di protocollo | **Ricompense solo per persone verificate** |
| Quota comunitaria per nuovo token | Non è una regola di protocollo | Non è una regola di protocollo | **27% di ogni token lanciato** |

1. ethereum.org — Gas and fees: https://ethereum.org/en/developers/docs/gas/
2. solana.com — Fees: https://solana.com/docs/core/fees
3. ethereum.org — History (2014 Ether sale): https://ethereum.org/en/history/
4. Solana Labs, "Solana Completes $20 Million Raise Led by Multicoin Capital" (30 Jul 2019): https://medium.com/solana-labs/solana-completes-20-million-raise-led-by-multicoin-capital-3d7f939475b6 · CoinDesk (30 Jul 2019): https://www.coindesk.com/markets/2019/07/30/multicoin-leads-20-million-round-for-speed-focused-solana-blockchain
5. ethereum.org — Accounts: https://ethereum.org/en/developers/docs/accounts/

*Fonti verificate Ottobre 2026. "Non è una regola/requisito di protocollo" significa che la documentazione citata non descrive tale regola. Questo confronta le scelte di design, non la qualità.*

---

## Link

- Website: https://peopleblockchain.network
- Million Founders: https://peopleblockchain.network/founders
- Litepaper: https://peopleblockchain.network/litepaper
- Telegram: https://t.me/people_blockchain
- X: https://x.com/Peoplebchain
- YouTube: https://www.youtube.com/@PeoplesBlockchain

---

### Cosa è cambiato nella v1.1

- La quota comunitaria di un nuovo token è il **27%** della fornitura: **10%** assegnato al lancio più **~16,7%** prelevato dalla curva alla migrazione.
- Il vesting del team è **0% al lancio, un cliff di 6 mesi e poi 18 mesi lineari** (24 mesi in totale).
- Commissioni di lancio: il piano approvato è un importo fisso di **1 USD per il lancio di un token e 2 USD per il mint di un NFT**, pagabile in PPL, USDT o USDC, con uno sconto del 20% pagando in PPL a un prezzo TWAP; le factory distribuite applicano ancora una commissione fissa in PPL.
- **Al momento non c'è alcuna vendita pubblica di PPL** e non vengono eseguiti controlli KYC o di eleggibilità.
- Sicurezza: ora una **revisione interna assistita dall'IA** e un'**audit indipendente prima della mainnet**.
- Il multisig del tesoro è **2 su 3** e viene creato prima della mainnet.
- Se la curva di un token non si esaurisce entro **180 giorni** dal lancio, chiunque può finalizzarla e i token invenduti vanno al pool della community di quel token. Una curva esaurita passa alla liquidità come prima. (Attiva sulla testnet.)
- La vendita PPL, una volta aperta, dura **180 giorni** fissi. Dopo, chiunque può finalizzarla e i PPL invenduti vanno al pool della community — la stessa regola delle curve dei token.
