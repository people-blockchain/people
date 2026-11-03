---
title: "PEOPLE Blockchain — Litepaper"
description: "The blockchain where every user is a verified human. Owned by people, not VCs."
slug: /litepaper
version: "1.1"
date: 2026-10
status: public-draft
---

# PEOPLE Blockchain — Litepaper

> **The blockchain where every user is a verified human.**
> **Owned by people, not VCs.**

Our mission: put a blockchain in the hands of ordinary people — no code, no crypto skills, no bots, no insiders.

*v1.1 · October 2026 · Numbers are preliminary and subject to community governance. Nothing in this document is a promise of income.*

---

## At a glance

| | |
|---|---|
| Supply | **1,000,000,000 PPL**, fixed |
| Every launched token | **10%** of supply goes to that token's own community pool |
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

**10% of every launched token goes to its community.** Built into the protocol, not promised in a post: every standard launch sends 10% of its supply to that token's own community pool. It is never mixed with network fees.

---

## 3. Product

What you can do without code:

| Tool | What it does | Status |
|---|---|---|
| **No-code tokens** | Name, ticker, image, supply. The token goes live on its own bonding curve; the first trade sets the price. 10% of supply goes to the token's community pool; the creator's share vests over 180 days. | Live on testnet |
| **NFT club cards** | Membership cards for a club, a café or a community — one per member, with an image you upload or generate. | Live on testnet |
| **Fundraising** | Collect support for a project with reviewed contract templates: escrow, vesting, token-weighted vote. Your community buys in on the curve, so demand sets the price — not a private round. | Live on testnet |
| **AI contracts** | Describe a smart contract in plain words. It is assembled from OpenZeppelin templates and you see the result before you deploy. | Live on testnet |
| **Community AI agents** | Agents that work for a group: a multisig community wallet with spending limits, whitelists and an emergency freeze. Parameters change only by token vote; every action is visible in the explorer. | Testnet: 1 community agent live |

---

## 4. Technology

**Cosmos EVM.** PEOPLE runs on a Cosmos EVM stack: Ethereum-compatible smart contracts and 0x addresses on a Cosmos chain.

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

**Fee flow.** 100% of token and NFT launch fees (USDC/USDT) go to public PPL buybacks. 30% of network fees go to public PPL buybacks (treasury 20% + liquidity 10%). The remaining 70% of network fees go to validators (30%), the community pool (25%) and the Growth Pool (15%). It all ultimately goes back to participants. Nothing is burned to fake scarcity.

**Token-launch fee.** Live on testnet: the deployed factories currently charge a fixed fee in PPL — 1.045005 PPL to launch a token and 2.925 PPL to mint an NFT. The approved plan is a flat **1 USD per token launch and 2 USD per NFT mint**, payable in PPL, USDT or USDC, with a 20% discount for paying in PPL at a TWAP price. The stablecoin option and the TWAP discount are not in the deployed code yet. 100% of token and NFT launch fees (USDC/USDT) go to public PPL buybacks, and the bought-back PPL is split 30/25/20/10/15 by the treasury multisig, same as every other buyback.

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

**PEOPLE Genesis Quest (2 November – 1 December 2026).** A one-month campaign before the PPL sale, paid from the same 50M Million Founders pool: Season 1 goes from 20M to 15M and the referral pool for all seasons from 15M to 10M (Season 1 referrals keep their 6M). The total stays 50M and nothing is minted.

- **Pool:** up to 25,000,000 PPL. 13M for verified people who do one real network action (300 PPL with Telegram, 1,500 PPL with Human Passport, at most 3,000 per person). 6M for referrals (500 PPL per invitee who has Human Passport and is still active after 7 days, at most 20 invitees). 6M for a top-100 leaderboard (1st place 500,000 PPL). Social follows are required but not paid.
- **Unlock:** fully locked until 1 March 2027, then 1/9 a month through 1 December 2027. Each ninth opens only if you made at least one network action that month. This schedule is separate from Founders season rewards.
- **No buyback:** the project never buys quest PPL back. The sell-back contract accepts only PPL bought in the sale. Unlocked quest PPL can move between participants once transfers open.

---

## 7. Roadmap

| Stage | What happens | Gate |
|---|---|---|
| **Season 0 — Public testnet** | Wallets, verification, token launches, NFT cards, swaps, Million Founders points. | Now |
| **PPL sale on Base** | The PPL sale runs on Base only (PplCurveHub, USDC or USDT). Published sale parameters (exponential curve from **$0.005** per PPL, up to **100M PPL** on the curve, **$4M** graduation) are on `/buy`; purchases stay disabled until the sale contract is published. Mainnet of the PEOPLE network is a separate step. | Sale contract (PplCurveHub on Base) and receiving multisig published |
| **Staking & validators** | Staking and validator participation open beyond the project. | After mainnet |

No dates are promised. Each stage starts when its gate is met.

---

## 8. Team & funding

- **Anonymous by choice.** A small team. We publish work, code and rules, not faces.
- **Self-funded.** No VC money. No investor allocations. No private round.
- **Same rules as everyone.** The team's 15% vests: 0% at launch, 6-month cliff, then 18 months linear (24 months total). There is no team line in the network fee split.

---

## 9. Security

- Reviewed by AI models: Claude Opus 5.5, GPT Astra, Fable 5.1 (run by the project team). This is not a security audit. No external audit has been done yet. Bug bounty: report a vulnerability from the bug button on any page.
- **Multisigs.** Network-fee treasury: a 2-of-3 multisig on the PEOPLE network. Sale proceeds: the project multisig on Base; its address and signer threshold are published before the sale opens.
- **Published addresses.** The sale contract and the receiving multisig are published before the sale opens; vesting and LP-lock contracts at the full network launch. No placeholders.
- **Bot defence.** Human verification, per-device and per-IP limits, daily point caps and bot clawback.
- **Proven building blocks.** No-code contracts are assembled from OpenZeppelin templates.

---

## 10. Risks & disclaimer

- **No promise of income.** PPL, points and rewards are not an investment product. Nothing here promises profit, yield or returns.
- **Prices can go to zero.** Token prices can go up, down, or to zero.
- **Testnet is not mainnet.** Testnet tokens and balances carry no value. Points are a record of activity, not a payout guarantee.
- **Everything is preliminary.** Numbers, schedules and rules may change before mainnet and are subject to community governance.
- **Technology risk.** Software can have bugs. An audit reduces risk; it does not remove it.
- **Regulation.** Rules differ by country and may change. Published PPL sale parameters are on `/buy` (curve from **$0.005** per PPL); purchases stay disabled until the sale hub contract is deployed. No KYC or sale-eligibility checks run on this site.
- **Do your own research.** This litepaper is information, not financial, legal or tax advice.

---

## How we differ

Only verifiable public facts about other networks. Sources below.

| | Ethereum | Solana | PEOPLE |
|---|---|---|---|
| Fees burned | Base fee is burned ¹ | 50% of the base fee is burned ² | **0% burned** |
| Who receives fees | Validators get the priority fee (tip) ¹ | Validators get 50% of the base fee and 100% of the priority fee ² | **Validators 30 · Community 25 · Treasury 20 · Liquidity 10 · Growth 15** |
| Early funding | Public ether sale, 2014 (42 days, paid in BTC) ³ | $20M Series A led by Multicoin Capital (2019); investors received SOL tokens ⁴ | **Self-funded. No VC, no investor allocation** |
| Account creation | Creating an account costs nothing; no identity check ⁵ | Not a protocol requirement | **Rewards only for verified humans** |
| New-token community share | Not a protocol rule | Not a protocol rule | **10% of every launched token** |

1. ethereum.org — Gas and fees: https://ethereum.org/en/developers/docs/gas/
2. solana.com — Fees: https://solana.com/docs/core/fees
3. ethereum.org — History (2014 Ether sale): https://ethereum.org/en/history/
4. Solana Labs, "Solana Completes $20 Million Raise Led by Multicoin Capital" (30 Jul 2019): https://medium.com/solana-labs/solana-completes-20-million-raise-led-by-multicoin-capital-3d7f939475b6 · CoinDesk (30 Jul 2019): https://www.coindesk.com/markets/2019/07/30/multicoin-leads-20-million-round-for-speed-focused-solana-blockchain
5. ethereum.org — Accounts: https://ethereum.org/en/developers/docs/accounts/

*Sources checked October 2026. "Not a protocol rule/requirement" means the cited documentation describes no such rule. This compares design choices, not quality.*

---

## Links

- Website: https://www.peopleblockchain.network
- Million Founders: https://www.peopleblockchain.network/founders
- Litepaper: https://www.peopleblockchain.network/litepaper
- Telegram: https://t.me/people_blockchain
- X: https://x.com/Peoplebchain
- YouTube: https://www.youtube.com/@PeoplesBlockchain

---

### What changed in v1.1

- A new token's community share is **10%** of supply: **10%** allocated at launch.
- Team vesting is **0% at launch, a 6-month cliff, then 18 months linear** (24 months in total).
- Launch fees: the approved plan is a flat **1 USD per token launch and 2 USD per NFT mint**, payable in PPL, USDT or USDC, with a 20% discount for paying in PPL at a TWAP price; the deployed factories still charge a fixed PPL fee.
- The **PPL community sale** uses the published exponential curve on `/buy` (starts at **$0.005** per PPL; prices and limits are public; the buy action stays off until the hub contract is deployed). No KYC or sale-eligibility checks are run on this site.
- Security: Reviewed by AI models: Claude Opus 5.5, GPT Astra, Fable 5.1 (run by the project team). This is not a security audit. No external audit has been done yet. Bug bounty on every page.
- Multisigs. Network-fee treasury: a 2-of-3 multisig on the PEOPLE network. Sale proceeds: the project multisig on Base; its address and signer threshold are published before the sale opens.
- If a token's bonding curve does not sell out within **180 days** of launch, anyone can finalize it and the unsold tokens go to that token's community pool. A curve that sells out moves to liquidity as before. (Live on testnet.)
- The sale runs until it sells out (the curve closes at $4M raised) or for 24 months from opening, whichever comes first. No extensions. Unsold PPL goes to the Community Pool. No refunds: every purchase is final.
