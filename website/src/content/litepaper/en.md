---
title: "People Blockchain — Litepaper"
description: "The blockchain where every user is a verified human. Owned by people, not VCs."
slug: /litepaper
version: "1.1"
date: 2026-10
status: public-draft
---

# People Blockchain — Litepaper

> **The blockchain where every user is a verified human.**
> **Owned by people, not VCs.**

Our mission: put a blockchain in the hands of ordinary people — no code, no crypto skills, no bots, no insiders.

*v1.1 · October 2026 · Numbers are preliminary and subject to community governance. Nothing in this document is a promise of income.*

---

## At a glance

| | |
|---|---|
| Supply | **1,000,000,000 PPL**, fixed |
| Every launched token | **27%** of supply goes to that token's own community pool |
| Network fees burned | **0%** — every fee is shared |
| Who earns rewards | **Verified humans** (Telegram phone or Human Passport) |
| Funding | **Self-funded.** No VC. No investor allocation. |
| Network today | Public **testnet** — Cosmos EVM, chain id `people_97401-1` / EVM `97401` |

---

## 1. The problem

**Crypto was built for insiders.** Most chains assume you can read code, manage seed phrases and spot a scam on your own.

**Bots get the rewards.** Airdrops and reward programs are farmed by scripts and fake accounts. Real people get a sliver.

**Launches favour whales.** Private rounds and insider allocations mean that the community often arrives last and pays the highest price.

## 2. Our answer

**A blockchain for ordinary people.** A phone or a browser is enough. Launch a token, mint club cards or raise money for an idea — with a form, not code.

**Verified humans, not bots.** Rewards go to accounts that passed a free human check. One person, one account. Sign-up alone earns nothing.

**27% of every launched token goes to its community.** Built into the protocol, not promised in a post: every standard launch sends 27% of its supply to that token's own community pool. It is never mixed with network fees.

---

## 3. Product

What you can do without code:

| Tool | What it does | Status |
|---|---|---|
| **No-code tokens** | Name, ticker, image, supply. The token goes live on its own bonding curve; the first trade sets the price. 27% of supply goes to the token's community pool; the creator's share vests over 180 days. | Live on testnet |
| **NFT club cards** | Membership cards for a club, a café or a community — one per member, with an image you upload or generate. | Live on testnet |
| **Fundraising** | Collect support for a project with reviewed contract templates: escrow, vesting, token-weighted vote. Your community buys in on the curve, so demand sets the price — not a private round. | Live on testnet |
| **AI contracts** | Describe a smart contract in plain words. It is assembled from OpenZeppelin templates and you see the result before you deploy. | Live on testnet |
| **Community AI agents** | Agents that work for a group: a multisig community wallet with spending limits, whitelists and an emergency freeze. Parameters change only by token vote; every action is visible in the explorer. | Testnet: 1 community agent live |

---

## 4. Technology

**Cosmos EVM.** People runs on a Cosmos EVM stack: Ethereum-compatible smart contracts and 0x addresses on a Cosmos chain.

| Parameter | Value |
|---|---|
| Cosmos chain id | `people_97401-1` |
| EVM chain id | `97401` |
| Native coin | PPL (base denom `appl`, 18 decimals) |
| Address prefix | `people1…` (and the same account as `0x…` in EVM) |
| Network status | Public testnet — not mainnet |

**Validators.** Validators run the network and are paid from the pre-allocated validator pool plus 30% of every network fee. Testnet validators run for testing only; opening validation and staking to the public is a later roadmap stage.

**Verification — one check that you are a person.** Free, done once:

- **Level 1 — Telegram:** share your phone number once in our Telegram bot. One number per founder. Earns 50% of base points.
- **Level 2 — Human Passport:** verify with Human Passport. Earns 100% of base points.
- **No verification, no points.** No founder points on testnet and no personal PPL rewards on mainnet without it.

---

## 5. Tokenomics

**Fixed supply: 1,000,000,000 PPL.** Years 1–4: 0% inflation. From year 5, any new emission is capped at 2% a year and only by community vote.

### Genesis allocation

| Bucket | Share | PPL |
|---|---:|---:|
| Community & rewards | 35% | 350,000,000 |
| Validators & staking | 20% | 200,000,000 |
| Team & founders | 15% | 150,000,000 |
| Ecosystem treasury (DAO) | 15% | 150,000,000 |
| Community sale | 10% | 100,000,000 |
| Liquidity | 5% | 50,000,000 |

- **Team & founders vesting (15% of supply):** 0% at launch, 6-month cliff, then 18 months linear (24 months total).
- **No investor bucket.** There is no VC or private-round allocation.
- **Rewards come from existing pools.** Founders, bounties, ambassadors and airdrops are paid only from the Community & rewards bucket. No new coins are minted for them.

### Network fee split

Every protocol fee, including fractional fees, is split the same way:

| Recipient | Share |
|---|---:|
| Validators | 30% |
| Community pool | 25% |
| Treasury | 20% |
| Liquidity | 10% |
| Growth Pool | 15% |
| Burn | 0% |

**Buybacks.** The treasury (20%) and liquidity (10%) shares are used for public PPL buybacks. Nothing is burned to fake scarcity — fees go back to the network and its people.

**Token-launch fee.** Live on testnet: the deployed factories currently charge a fixed fee in PPL — 1.045005 PPL to launch a token and 2.925 PPL to mint an NFT. The approved plan is a flat **5 USD per token launch and 10 USD per NFT mint**, payable in PPL, USDT or USDC, with a 20% discount for paying in PPL at a TWAP price. The stablecoin option and the TWAP discount are not in the deployed code yet. 100% of launch fees goes to the public PPL buyback, and the bought-back PPL is split 30/25/20/10/15 by the treasury multisig, same as every other buyback.

---

## 6. Million Founders

**Be one of the first million verified people.** Get a founder number, invite friends and earn points when *they* do real things on the network.

**Points come from real actions, not sign-ups.** You earn invite points only after your invitee has verified, created a wallet and done at least one real testnet action (swap, liquidity pool, NFT mint, token launch or governance vote). Sign-up alone = 0.

**How points become PPL:**

> **PPL per point = season pool ÷ all points earned in the season**

- **Season 1 pool:** 6,000,000 PPL, paid from the existing Million Founders pool. No new coins. When the pool is empty, the program stops.
- **Payout:** 10% at once, the remaining 90% in equal weekly slices over 52 weeks.
- **Anti-farming:** two referral levels only, a per-season cap on active invitees, and clawback of points from accounts flagged as bots.

*Preliminary. Points, the PPL-per-point rate and the season budget may change before mainnet. Not a promise of income.*

---

## 7. Roadmap

| Stage | What happens | Gate |
|---|---|---|
| **Season 0 — Public testnet** | Wallets, verification, token launches, NFT cards, swaps, Million Founders points. | Now |
| **Mainnet + PPL sale** | Mainnet launches. The PPL sale is not open yet; it will only open once an operating legal entity exists. | At least 1,000 verified people **and** a live treasury multisig |
| **Staking & validators** | Staking and validator participation open beyond the project. | After mainnet |

No dates are promised. Each stage starts when its gate is met.

---

## 8. Team & funding

- **Anonymous by choice.** A small team. We publish work, code and rules, not faces.
- **Self-funded.** No VC money. No investor allocations. No private round.
- **Same rules as everyone.** The team's 15% vests: 0% at launch, 6-month cliff, then 18 months linear (24 months total). There is no team line in the network fee split.

---

## 9. Security

- **Security audit before mainnet.** Protocol contracts will go through a security audit before mainnet launch.
- **Treasury multisig.** The treasury is controlled by People's own 2-of-3 multisig contract on the People network, created before mainnet; signer addresses will be published.
- **Published addresses.** Sale, vesting and liquidity contract addresses will be published at mainnet launch — no placeholders.
- **Bot defence.** Human verification, per-device and per-IP limits, daily point caps and bot clawback.
- **Proven building blocks.** No-code contracts are assembled from OpenZeppelin templates.

---

## 10. Risks & disclaimer

- **No promise of income.** PPL, points and rewards are not an investment product. Nothing here promises profit, yield or returns.
- **Prices can go to zero.** Token prices can go up, down, or to zero.
- **Testnet is not mainnet.** Testnet tokens and balances carry no value. Points are a record of activity, not a payout guarantee.
- **Everything is preliminary.** Numbers, schedules and rules may change before mainnet and are subject to community governance.
- **Technology risk.** Software can have bugs. An audit reduces risk; it does not remove it.
- **Regulation.** Rules differ by country and may change. There is no public PPL sale at this time; no KYC or sale-eligibility checks are run.
- **Do your own research.** This litepaper is information, not financial, legal or tax advice.

---

## How we differ

Only verifiable public facts about other networks. Sources below.

| | Ethereum | Solana | People |
|---|---|---|---|
| Fees burned | Base fee is burned ¹ | 50% of the base fee is burned ² | **0% burned** |
| Who receives fees | Validators get the priority fee (tip) ¹ | Validators get 50% of the base fee and 100% of the priority fee ² | **Validators 30 · Community 25 · Treasury 20 · Liquidity 10 · Growth 15** |
| Early funding | Public ether sale, 2014 (42 days, paid in BTC) ³ | $20M Series A led by Multicoin Capital (2019); investors received SOL tokens ⁴ | **Self-funded. No VC, no investor allocation** |
| Account creation | Creating an account costs nothing; no identity check ⁵ | Not a protocol requirement | **Rewards only for verified humans** |
| New-token community share | Not a protocol rule | Not a protocol rule | **27% of every launched token** |

1. ethereum.org — Gas and fees: https://ethereum.org/en/developers/docs/gas/
2. solana.com — Fees: https://solana.com/docs/core/fees
3. ethereum.org — History (2014 Ether sale): https://ethereum.org/en/history/
4. Solana Labs, "Solana Completes $20 Million Raise Led by Multicoin Capital" (30 Jul 2019): https://medium.com/solana-labs/solana-completes-20-million-raise-led-by-multicoin-capital-3d7f939475b6 · CoinDesk (30 Jul 2019): https://www.coindesk.com/markets/2019/07/30/multicoin-leads-20-million-round-for-speed-focused-solana-blockchain
5. ethereum.org — Accounts: https://ethereum.org/en/developers/docs/accounts/

*Sources checked October 2026. "Not a protocol rule/requirement" means the cited documentation describes no such rule. This compares design choices, not quality.*

---

## Links

- Website: https://peopleblockchain.network
- Million Founders: https://peopleblockchain.network/founders
- Litepaper: https://peopleblockchain.network/litepaper
- Telegram: https://t.me/people_blockchain
- X: https://x.com/Peoplebchain
- YouTube: https://www.youtube.com/@PeoplesBlockchain

---

### What changed in v1.1

- A new token's community share is **27%** of supply: **10%** allocated at launch plus **~16.7%** swept from the bonding curve at migration.
- Team vesting is **0% at launch, a 6-month cliff, then 18 months linear** (24 months in total).
- Launch fees: the approved plan is a flat **5 USD per token launch and 10 USD per NFT mint**, payable in PPL, USDT or USDC, with a 20% discount for paying in PPL at a TWAP price; the deployed factories still charge a fixed PPL fee.
- There is **no public PPL sale at this time**, and no KYC or sale-eligibility checks are run.
- Security: an **internal, AI-assisted review** now, and an **independent audit before mainnet**.
- The treasury multisig is **2-of-3** and is created before mainnet.
