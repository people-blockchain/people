# Compact UX / Information Architecture — PEOPLE Blockchain public site

**Status:** `IMPLEMENTED` as a presentation change on the public Next.js site (`website/`).  
**Scope:** Compact hub IA (#18) plus selling first screen / core value proposition (this follow-up).  
**Not in scope:** consensus, fees, Growth Pool formulas, Token Factory, BondingCurveEngine, P2P, storage, prune/archival, deploy, Mainnet, auth.

Public package: **`website/`** (Next.js). Canonical origin in code: `https://www.peopleblockchain.network`.  
`people-node/apps/web` is the protocol explorer/wallet app — **not** this redesign.

Public routes before and after: `/` and `/how-it-works` (plus `robots.txt` / `sitemap.xml`). RU/EN is client language preference, not separate URL locales.

---

## 1. CURRENT → TARGET

### CURRENT (post-#18 compact hub, before selling landing)

The first screen named the product and the slogan, then asked the visitor to **explore the network**. A partner-link visitor did **not** see, without scrolling:

- why participation differs from a typical chain;
- **10%** token community allocation;
- network-fee routing;
- **L1/L2** Growth referral only on public surfaces (70/30 of Growth reward budget);
- a join CTA.

Compact sections below the hero were still a protocol hub (What / Roles / How / PPL / Validators / Economics / Token Market / Technology / Docs / Roadmap).

### TARGET (selling landing)

The **first screen sells the idea**. Technical hub content stays below as progressive disclosure.

In 5–10 seconds, without significant scroll, the visitor must see:

| Signal | Where |
| --- | --- |
| PEOPLE Blockchain | Hero H1 |
| Community participation | Slogan + value line |
| 10% token community allocation | Hero pillar (mandatory 10%, not 10%+ — no approved extra) |
| Network fees | Hero pillar + Model A bar |
| L1/L2 Growth referral (70/30) | Hero pillar + flow animation |
| Join | Primary CTA → `#join` |

Value line: **Community participates in the value created by the network.**

Three mechanisms stay visually separate: Token Factory supply allocation ≠ Model A fee split ≠ Growth referral L1/L2 (70/30 of Growth budget).

Legal copy: community participation / community-driven / built by the community. Shared by the community. No claim that every participant legally owns the blockchain. No claim that every PPL holder automatically receives 10% of every token.

### Hero structure

1. PEOPLE BLOCKCHAIN  
2. Created by people. For the community.  
3. Community participates in the value created by the network.  
4. Three compact pillars: **10%** / **Network fees** / **70/30 Growth referral**  
5. Lightweight CSS/React flow: Token created → 10% community + network fee → network economy + Growth Pool → L1 70% → L2 30% (horizontal desktop, vertical mobile; pause control; `prefers-reduced-motion` static)  
6. Primary **Join the community** (`#join`) · Secondary **How it works** (`/how-it-works`)

Then: three mechanism cards → Growth referral YOU→L1→L2 (70/30) + “How Growth referral works” disclosure → how to participate → existing hub sections.

Reference UX **logic** (not visual brand): [auswandernhilft.de](https://auswandernhilft.de/) — short hero, compact cards, accordion, summary → details.

---

## 2. Sitemap (public)

```text
/                      Selling homepage + compact hub below
/how-it-works          Existing 10-chapter economic story (unchanged narrative)
#community-value       Three distinct mechanisms
#partner               Growth referral L1/L2 (70/30)
#join                  How to participate (no new auth route)
#what-is               What is PEOPLE Blockchain
#what-can-i-do         Roles (also keeps #audiences)
#how-the-network-works Flow (also keeps #how-it-works-teaser)
#ppl                   Native asset
#network               Validators / network status
#economics             Model A fee split (network fees only)
#token-market          Create → Launch → Discover → Trade
#technology            Consensus / state / P2P / storage / security / SDK
#roadmap               CURRENT → TESTNET → BETA → FUTURE
#documentation         Specs entry (keeps #specifications)
#concept #architecture #phase-1 #phase-2 #phase-3 #invariants
                       Legacy anchors preserved
```

---

## 3. Component architecture

| Piece | Role |
| --- | --- |
| `Hero` | Selling first screen: H1, slogan, value line, 10% / fees / Growth referral 70/30, flow animation, Join + How it works |
| `visuals/ValueFlowAnimation` | CSS/React flow; pause; reduced-motion fallback |
| `selling/SellingSections` | Three mechanisms, Growth referral YOU→L1→L2, join steps |
| `hub/WhatIsSection` | Summary + accordion: Consensus / Economics / Participation / Technology |
| `hub/WhatCanIDoSection` | Five compact role cards; audience copy on demand |
| `hub/NetworkFlowSection` | Horizontal six-step flow with expand |
| `hub/PplSection` | Confirmed PPL characteristics only |
| `hub/NetworkSection` | Compact validator/network facts; experimental/TBD labelled |
| `hub/EconomicsSection` | Model A visual 30/25/20/10/15/0; details on demand |
| `hub/TokenMarketSection` | Four-step market path; curve/liquidity expandable |
| `hub/TechnologySection` | Six tech cards; architecture inspector + invariants on demand |
| `hub/RoadmapSection` | Four status columns from existing facts |
| `hub/DocumentationSection` | Spec entry + how-it-works |
| `ClosingCta` | Join + How it works |
| `ui/DisclosurePanel` | Native `<details>` (SEO + keyboard) |
| `ui/HScroll` | Desktop row / mobile snap scroll |

Existing Why / Audiences / Architecture / Invariants / Phase copy is **re-homed**, not deleted.

---

## 4. Progressive disclosure map

| Level | Where |
| --- | --- |
| WHAT / WHY / HOW | Closed cards, hero, flow labels, Model A bars |
| HOW EXACTLY | `<details>` under each hub block |
| TECHNICAL DETAILS | Architecture inspector, invariants, phase module lists, `/how-it-works` |

---

## 5. Economics (presentation only)

Homepage **network fee** visual uses **approved Model A** (`docs/ECONOMIC-MODEL-v0.1.md`):

Validators 30% · Community 25% · Treasury 20% · Liquidity & Ecosystem 10% · Growth Pool 15% · Burn 0%.

Token-factory **10% community supply** is shown only under Token Market / creator path — **not** mixed into the Model A fee bars.

**Not changed in protocol code.** No new parameters.

### Known content tension (report only — not fixed here)

`/how-it-works` and some architecture inspector strings still describe a **legacy 40 / 25 / 20 / 10 / 5** fee split. That copy predates Model A. This task does not rewrite those numbers in the explainer (no silent economic “fix”). Operators should align that page in a **separate, founder-gated content PR**.

---

## 6. Honesty labels

- Internal testnet ≠ Mainnet.
- Phase 3 human network = planned / design.
- Bonding-curve and AMM numbers on the public site remain **testnet provisional / TBD** where the specs say so.
- Growth Pool is a **fee-split destination**, not guaranteed/passive income.
- No fake Mainnet date.

---

## 7. SEO / a11y

- Keep a single H1 on `/`.
- Section H2s remain in the server-rendered tree.
- Accordion bodies use native `<details>` so copy is in HTML when closed.
- Legacy hash routes still resolve.
- RU/EN strings live in `hub-content.ts` + existing `content.ts`.
- Keyboard: `<details>` / links / skip-to-content unchanged.
