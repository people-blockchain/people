---
title: "People Blockchain — Litepaper"
description: "Die Blockchain, auf der jeder Benutzer ein verifi­zierter Mensch ist. Von Menschen kontrolliert, nicht von VCs."
slug: /litepaper
version: "1.1"
date: 2026-10
status: public-draft
---

# People Blockchain — Litepaper

> **Die Blockchain, auf der jeder Benutzer ein verifi­zierter Mensch ist.**
> **Von Menschen kontrolliert, nicht von VCs.**

*v1.1 · Oktober 2026 · Die Zahlen sind vorläufig und unterliegen Abstimmungen in der Community. Nichts in diesem Dokument ist eine Einkommensgarantie.*

---

## Auf einen Blick

| | |
|---|---|
| Angebot | **1.000.000.000 PPL**, fest |
| Jeder gestartete Token | **10%** des Angebots gehen an den Community-Pool dieses Tokens |
| Netzwerk­gebühren verbrannt | **0%** — jede Gebühr wird geteilt |
| Wer Belohnungen erhält | **Verifizierte Menschen** (Telegram-Telefon oder Human Passport) |
| Finanzierung | **Self-finanziert.** Keine VCs. Keine Investor-Zuteilungen. |
| Netzwerk heute | Öffentliches **Testnet** — Cosmos EVM, Chain-ID `people_97401-1` / EVM `97401` |

---

## 1. Das Problem

**Kryptographie wurde für Insider entwickelt.** Die meisten Chains setzen voraus, dass du Code lesen, Seed Phrases verwalten und Betrügereien selbst erkennen kannst.

**Bots erhalten die Belohnungen.** Airdrops und Belohnungs­programme werden von Scripts und Fake-Konten ausgebeutet. Echte Menschen bekommen nur einen Bruchteil.

**Launches begünstigen Wale.** Private Runden und Insider-Zuteilungen führen dazu, dass die Community oft zu spät kommt und den höchsten Preis zahlt.

## 2. Unsere Antwort

**Eine Blockchain für normale Menschen.** Ein Telefon oder Browser reicht aus. Starte einen Token, präge Club-Karten oder sammle Geld für eine Idee — mit einem Formular, nicht mit Code.

**Verifizierte Menschen, keine Bots.** Belohnungen gehen an Konten, die eine kostenlose Personen­prüfung bestanden haben. Eine Person, ein Konto. Eine Anmeldung allein bringt nichts.

**10% jedes gestarteten Tokens gehen an seine Community.** Ins Protokoll eingebaut, nicht nur versprochen: Jeder Standard-Launch sendet 10% seines Angebots an den Community-Pool dieses Tokens. Es wird nie mit Netzwerk­gebühren vermischt.

---

## 3. Produkt

Was du ohne Code tun kannst:

| Tool | Was es tut | Status |
|---|---|---|
| **No-Code-Token** | Name, Ticker, Bild, Angebot. Der Token läuft auf seiner eigenen Bonding Curve live; der erste Trade setzt den Preis. 10% des Angebots gehen an den Community-Pool des Tokens; der Anteil des Erstellers wird über 180 Tage abgebaut. | Live auf Testnet |
| **NFT-Club-Karten** | Mitglieds­karten für einen Club, ein Café oder eine Community — eine pro Mitglied, mit einem Bild, das du hochlädst oder generierst. | Live auf Testnet |
| **Fundraising** | Sammeln von Unterstützung für ein Projekt mit überprüften Vertrags­vorlagen: Escrow, Vesting, Token-gestütztes Abstimmen. Deine Community kauft auf der Curve ein, also setzt Nachfrage den Preis — nicht eine private Runde. | Live auf Testnet |
| **KI-Verträge** | Beschreibe einen Smart Contract in einfachen Worten. Er wird aus OpenZeppelin-Vorlagen zusammengesetzt und du siehst das Ergebnis, bevor du es einsetzt. | Live auf Testnet |
| **Community-KI-Agenten** | Agenten, die für eine Gruppe arbeiten: eine Multisig-Community-Wallet mit Ausgabelimits, Whitelists und einem Notfall-Freeze. Parameter ändern sich nur durch Token-Abstimmung; jede Aktion ist im Explorer sichtbar. | Testnet: 1 Community-Agent aktiv |

---

## 4. Technologie

**Cosmos EVM.** People läuft auf einem Cosmos EVM Stack: Ethereum-kompatible Smart Contracts und 0x-Adressen auf einer Cosmos-Chain.

| Parameter | Wert |
|---|---|
| Cosmos Chain-ID | `people_97401-1` |
| EVM Chain-ID | `97401` |
| Systemeigene Münze | PPL (Basis-Denom `appl`, 18 Dezimalstellen) |
| Adressprefix | `people1…` (und dieselbe Adresse als `0x…` in EVM) |
| Netzwerk­status | Öffentliches Testnet — kein Mainnet |

**Validatoren.** Validatoren betreiben das Netzwerk und werden vom vorab zugeordneten Validator-Pool plus 30% jeder Netzwerk­gebühr bezahlt. Testnet-Validatoren laufen nur zum Testen; die Öffnung von Validierung und Staking für die Öffentlichkeit ist eine spätere Roadmap-Etappe.

**Verifizierung — eine Überprüfung, dass du eine Person bist.** Kostenlos, einmalig:

- **Stufe 1 — Telegram:** Teile deine Telefonnummer einmal in unserem Telegram-Bot. Eine Nummer pro Gründer. Verdient 50% der Basispunkte.
- **Stufe 2 — Human Passport:** Verifiziere dich mit Human Passport. Verdient 100% der Basispunkte.
- **Keine Verifizierung, keine Punkte.** Keine Gründerpunkte auf dem Testnet und keine persönlichen PPL-Belohnungen auf dem Mainnet ohne Verifizierung.

---

## 5. Tokenomik

**Festes Angebot: 1.000.000.000 PPL.** Jahre 1–4: 0% Inflation. Ab Jahr 5 ist jede neue Emission auf 2% pro Jahr begrenzt und nur durch Community-Abstimmung möglich.

### Genesis-Zuteilung

| Einteilung | Anteil | PPL |
|---|---:|---:|
| Community & Belohnungen | 35% | 350.000.000 |
| Validatoren & Staking | 20% | 200.000.000 |
| Team & Gründer | 15% | 150.000.000 |
| Ecosystem Treasury (DAO) | 15% | 150.000.000 |
| Community Sale | 10% | 100.000.000 |
| Liquidität | 5% | 50.000.000 |

- **Team & Gründer Vesting (15% des Angebots):** 0% beim Start, 6-Monats-Cliff, dann 18 Monate linear (24 Monate insgesamt).
- **Kein Investor-Eintrag.** Es gibt keine VC- oder Private-Round-Zuteilung.
- **Belohnungen kommen aus bestehenden Pools.** Gründer, Bounties, Botschafter und Airdrops werden nur aus dem Community & Belohnungen-Pool bezahlt. Für sie werden keine neuen Coins geprägt.

### Netzwerk­gebühren-Aufteilung

Jede Protokollgebühr, einschließlich Bruchgebühren, wird auf die gleiche Weise aufgeteilt:

| Empfänger | Anteil |
|---|---:|
| Validatoren | 30% |
| Community-Pool | 25% |
| Treasury | 20% |
| Liquidität | 10% |
| Growth Pool | 15% |
| Verbrannt | 0% |

**Gebührenfluss.** 100% der Token- und NFT-Launch-Gebühren (USDC/USDT) fließen in öffentliche PPL-Rückkäufe. 30% der Netzwerkgebühren fließen in öffentliche PPL-Rückkäufe (Treasury 20% + Liquidität 10%). Die verbleibenden 70% der Netzwerkgebühren gehen an Validatoren (30%), den Community Pool (25%) und den Growth Pool (15%). Alles fließt letztendlich an die Teilnehmer zurück. Nichts wird verbrannt, um Knappheit vorzutäuschen.

**Token-Launch-Gebühr.** Live im Testnet: Die bereitgestellten Fabriken verlangen weiterhin eine feste PPL-Gebühr — 1,045005 PPL für einen Token-Launch und 2,925 PPL für ein NFT-Minting. Der genehmigte Plan ist eine feste Gebühr von **1 USD pro Token-Launch und 2 USD pro NFT-Mint**, zahlbar in PPL, USDT oder USDC, mit 20 % Rabatt bei Zahlung in PPL zu einem TWAP-Preis. Die Stablecoin-Option und der TWAP-Rabatt sind noch nicht im bereitgestellten Code. 100% der Token- und NFT-Launch-Gebühren (USDC/USDT) fließen in öffentliche PPL-Rückkäufe, und die zurückgekauften PPL werden vom Treasury-Multisig im Verhältnis 30/25/20/10/15 aufgeteilt, genau wie bei jedem anderen Rückkauf.

---

## 6. Million Founders

**Sei einer der ersten Million verifizierter Menschen.** Erhalte eine Gründernummer, lade Freunde ein und verdiene Punkte, wenn *sie* echte Dinge im Netzwerk tun.

**Punkte kommen von echten Handlungen, nicht von Anmeldungen.** Du erhältst Einladungspunkte erst, nachdem dein Einladener verifiziert wurde, eine Wallet erstellt hat und mindestens eine echte Testnet-Aktion durchgeführt hat (Swap, Liquiditäts-Pool, NFT-Prägung, Token-Start oder Governance-Abstimmung). Eine Anmeldung allein = 0.

**Wie Punkte zu PPL werden:**

> **PPL pro Punkt = Saison-Pool ÷ alle in der Saison verdienen Punkte**

- **Season 1 Pool:** 6.000.000 PPL, bezahlt aus dem bestehenden Million Founders-Pool. Keine neuen Coins. Wenn der Pool leer ist, endet das Programm.
- **Auszahlung:** 10% sofort, die restlichen 90% in gleichen wöchentlichen Raten über 52 Wochen.
- **Anti-Farming:** nur zwei Verweis-Ebenen, ein Pro-Saison-Cap für aktive Einladene und Rückforderung von Punkten von Konten, die als Bots gekennzeichnet sind.

*Vorläufig. Punkte, der PPL-pro-Punkt-Satz und das Saison-Budget können sich vor dem Mainnet ändern. Keine Einkommensgarantie.*

---

## 7. Roadmap

| Etappe | Was passiert | Gate |
|---|---|---|
| **Season 0 — Öffentliches Testnet** | Wallets, Verifizierung, Token-Starts, NFT-Karten, Swaps, Million Founders Punkte. | Jetzt |
| **Mainnet + PPL-Sale** | Mainnet startet. Der PPL-Sale ist noch nicht offen; er öffnet erst, wenn eine operativ tätige juristische Person existiert. | Mindestens 1.000 verifizierte Menschen **und** ein aktives Treasury Multisig |
| **Staking & Validatoren** | Staking und Validator-Beteiligung öffnen sich über das Projekt hinaus. | Nach Mainnet |

Es werden keine Daten versprochen. Jede Etappe beginnt, wenn ihr Gate erfüllt ist.

---

## 8. Team & Finanzierung

- **Anonym aus Wahl.** Ein kleines Team. Wir veröffentlichen Arbeit, Code und Regeln, nicht Gesichter.
- **Self-finanziert.** Kein VC-Geld. Keine Investor-Zuteilungen. Keine Private-Round.
- **Gleiche Regeln wie alle anderen.** Das 15%-Vesting des Teams: 0% beim Start, 6-Monats-Cliff, dann 18 Monate linear (24 Monate insgesamt). Es gibt keine Team-Zeile in der Netzwerk­gebühren-Aufteilung.

---

## 9. Sicherheit

- **Sicherheitsprüfung vor Mainnet.** Protokoll-Verträge werden vor dem Mainnet-Start einer Sicherheitsprüfung unterzogen.
- **Treasury Multisig.** Die Treasury wird von People's eigenem 2-von-3-Multisig-Vertrag im People-Netzwerk verwaltet, der vor dem Mainnet erstellt wird; Signer-Adressen werden veröffentlicht.
- **Veröffentlichte Adressen.** Sale-, Vesting- und Liquiditäts-Vertrags­adressen werden beim Mainnet-Start veröffentlicht — keine Platzhalter.
- **Bot-Abwehr.** Verifizierung von Menschen, Pro-Gerät- und Pro-IP-Limits, tägliche Punkt-Caps und Bot-Rückforderung.
- **Bewährte Bausteine.** No-Code-Verträge werden aus OpenZeppelin-Vorlagen zusammengesetzt.

---

## 10. Risiken & Haftungsausschluss

- **Keine Einkommensgarantie.** PPL, Punkte und Belohnungen sind kein Anlage­produkt. Nichts hier verspricht Gewinn, Rendite oder Gewinne.
- **Preise können auf Null gehen.** Token-Preise können steigen, fallen oder auf Null gehen.
- **Testnet ist nicht Mainnet.** Testnet-Token und -Guthaben haben keinen Wert. Punkte sind eine Aufzeichnung von Aktivität, keine Auszahlungsgarantie.
- **Alles ist vorläufig.** Zahlen, Zeitpläne und Regeln können sich vor dem Mainnet ändern und unterliegen Community-Abstimmungen.
- **Technologie­risiko.** Software kann Fehler haben. Eine Prüfung reduziert das Risiko; es beseitigt es nicht.
- **Regulierung.** Die Regeln unterscheiden sich je nach Land und können sich ändern. Derzeit gibt es keinen öffentlichen PPL-Sale; es werden keine KYC-Prüfungen durchgeführt.
- **Führe deine eigene Recherche durch.** Dieses Litepaper ist Information, keine Finanz-, Rechts- oder Steuerberatung.

---

## Wie wir uns unterscheiden

Nur überprüfbare öffentliche Fakten über andere Netzwerke. Quellen unten.

| | Ethereum | Solana | People |
|---|---|---|---|
| Gebühren verbrannt | Basis­gebühr wird verbrannt ¹ | 50% der Basis­gebühr wird verbrannt ² | **0% verbrannt** |
| Wer erhält Gebühren | Validatoren erhalten die Prioritäts­gebühr (Trinkgeld) ¹ | Validatoren erhalten 50% der Basis­gebühr und 100% der Prioritäts­gebühr ² | **Validatoren 30 · Community 25 · Treasury 20 · Liquidität 10 · Growth 15** |
| Frühe Finanzierung | Öffentliche Ether-Sale, 2014 (42 Tage, zahlbar in BTC) ³ | $20M Series A unter Führung von Multicoin Capital (2019); Investoren erhielten SOL-Token ⁴ | **Self-finanziert. Keine VCs, keine Investor-Zuteilung** |
| Konto­erstellung | Einen Account zu erstellen kostet nichts; keine Identitäts­überprüfung ⁵ | Keine Protokoll-Anforderung | **Belohnungen nur für verifizierte Menschen** |
| Community-Anteil bei neuem Token | Keine Protokoll-Regel | Keine Protokoll-Regel | **10% jedes gestarteten Tokens** |

1. ethereum.org — Gas and fees: https://ethereum.org/en/developers/docs/gas/
2. solana.com — Fees: https://solana.com/docs/core/fees
3. ethereum.org — History (2014 Ether sale): https://ethereum.org/en/history/
4. Solana Labs, "Solana Completes $20 Million Raise Led by Multicoin Capital" (30 Jul 2019): https://medium.com/solana-labs/solana-completes-20-million-raise-led-by-multicoin-capital-3d7f939475b6 · CoinDesk (30 Jul 2019): https://www.coindesk.com/markets/2019/07/30/multicoin-leads-20-million-round-for-speed-focused-solana
5. ethereum.org — Accounts: https://ethereum.org/en/developers/docs/accounts/

*Quellen überprüft Oktober 2026. "Keine Protokoll-Regel/Anforderung" bedeutet, dass die zitierte Dokumentation keine solche Regel beschreibt. Dies vergleicht Designentscheidungen, nicht Qualität.*

---

## Links

- Website: https://peopleblockchain.network
- Million Founders: https://peopleblockchain.network/founders
- Litepaper: https://peopleblockchain.network/litepaper
- Telegram: https://t.me/people_blockchain
- X: https://x.com/Peoplebchain
- YouTube: https://www.youtube.com/@PeoplesBlockchain

---

### Was sich in v1.1 geändert hat

- Der Community-Anteil eines neuen Tokens beträgt **10 %** des Angebots, bei der Einführung zugeteilt.
- Das Team-Vesting ist **0 % beim Start, ein 6-monatiger Cliff, danach 18 Monate linear** (insgesamt 24 Monate).
- Launch-Gebühren: Der genehmigte Plan ist eine feste Gebühr von **1 USD pro Token-Launch und 2 USD pro NFT-Mint**, zahlbar in PPL, USDT oder USDC, mit 20 % Rabatt bei Zahlung in PPL zu einem TWAP-Preis; die bereitgestellten Fabriken verlangen weiterhin eine feste PPL-Gebühr.
- **Derzeit gibt es keinen öffentlichen PPL-Sale**, und es werden keine KYC- oder Teilnahmeberechtigungsprüfungen durchgeführt.
- Sicherheit: jetzt eine **interne, KI-gestützte Prüfung** und ein **unabhängiges Audit vor dem Mainnet**.
- Das Treasury-Multisig ist **2-von-3** und wird vor dem Mainnet erstellt.
- Ist die Bonding-Curve eines Tokens **180 Tage** nach dem Launch nicht ausverkauft, kann jeder sie abschließen; die unverkauften Token gehen in den Community-Pool dieses Tokens. Eine ausverkaufte Curve geht wie bisher in die Liquidität. (Im Testnet live.)
- Der PPL-Sale läuft nach seiner Öffnung fest **180 Tage**. Danach kann jeder ihn abschließen, und die unverkauften PPL gehen in den Community-Pool — dieselbe Regel wie bei Token-Curves.
