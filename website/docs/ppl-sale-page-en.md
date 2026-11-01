# The PPL Sale: how it works

## In one paragraph
100,000,000 PPL (10% of the fixed 1 billion supply) are sold on Base for USDC or USDT through a public price curve (the sale hub contract). The price starts at **$0.005** and rises as more PPL is bought, up to a hard ceiling of **$0.25**. The sale runs until all PPL is sold or **24 months (730 days)** pass, whichever comes first. There is no raise target and no "graduation" threshold: the curve simply keeps going until it sells out or the term ends. Unsold PPL then goes to the **Community Pool**, and there are no refunds.

## How the curve works
The price is not set by hand. It is set by a published formula. Every purchase moves the price up a little, and every sale back into the curve moves it down by the same rule. Anyone can check the current price and how much has been sold at any moment.

- Starting price: **$0.005**
- Price ceiling: **$0.25**. It is reached only if all 100M PPL are sold. The price can never go above it on the curve.
- Full sell-out: if all 100M PPL are sold, about **$6.26M** is raised and the price ends at the $0.25 ceiling. There is no earlier cut-off.
- Sale window: until all PPL is sold or **24 months (730 days)**, whichever comes first. The term is fixed and will not be extended. After it ends, unsold PPL goes to the Community Pool; there are no refunds. Until then, unsold PPL is held in the project multisig and the team does not touch it.

**Important:** the $0.25 ceiling applies on the curve only, while the sale is running. After the sale ends and the pool opens, the price is set by a free market, with no limit up or down.

You pay with USDC or USDT from Ethereum, BNB Chain, Polygon, Arbitrum and Base, or with stablecoins on TON, Tron and Solana. Whatever network you pay from, there is **one single curve and one price for everyone**.

## Why early is cheaper
The curve is a ramp. The first buyers buy at the bottom, where the price is lowest. Later buyers pay more because some PPL has already been taken. That is the whole benefit of being early: a lower price, set by a formula everyone can see in advance.\*

## Buying and selling
- **Buy:** choose your network and stablecoin, enter an amount, and see exactly how much PPL you get before you confirm.
- **Changed your mind?** Verified people can sell PPL back to the curve at the current curve price, minus a **1.5%** fee (**3%** only on the part of sell-backs in a rolling 24 hours above 1% of the reserve). The fee goes to **PPL buyback**, not to the team. Each purchase lot must be held **30 days** before it can be sold back. Sell-back limits: **2% of the reserve in any rolling 24 hours** overall and **$2,000 per address in a rolling 24-hour window**. Sell-back closes when the sale ends. Sell-back payout comes in **USDC on Base** (Coinbase's network; USDC issued by Circle, the same dollar as on Ethereum or Polygon, only faster and cheaper). Or choose your own network; the bridge takes a few minutes.
- **No refunds.** Outside the sell-back above, purchases are not refundable.
- **Slippage protection:** every trade has a minimum-received amount. If the price moves too much before your transaction lands, it is cancelled instead of filling at a worse price.

## Why this is not a pyramid
- **No promised returns.** Nobody is promised a profit, a percentage or a payout.
- **No payouts from new buyers to old buyers.** Your money buys PPL at the formula price; it is not passed to people who came earlier.
- **No recruiting rewards.** You get nothing for bringing in other buyers.
- **You hold what you bought.** PPL is recorded to you on the PEOPLE network the moment you buy, and you can sell it back to the curve. PPL transfers to other people and pool trading open with the full network launch: at 1,000 verified participants, and no later than 6 months.
- **Public rules.** The price formula, the ceiling, the sale term and where the money goes are fixed and published before the start.

## What goes wrong on curves without a ceiling, and what we do differently
Bonding curves became popular through launchpads like pump.fun. Their uncapped curves have well-known problems:

| Problem | What happens | Our protection |
|---|---|---|
| Late buyers overpay | The price can run up without limit, so the last buyers before the end pay many times what the first did | **Hard ceiling of $0.25.** The curve never goes above it, and the sale ends at sell-out or after 24 months |
| Snipers and bots | Scripts buy in the first seconds from many wallets and then sell to real people | **Up to $500 per purchase**, **up to $2,000 per address per day**, a **1-minute pause** between trades. If bots show up, the multisig can switch on a "verified only" mode |
| Dumps | Large holders sell everything at once and crash the price | Per-address limits make it harder to build a large position. The **sell fee** goes to PPL buyback. The liquidity share of the raise is **locked for 24 months** |
| Front-running and bad fills | A trade fills at a price much worse than the one shown | **Slippage protection** on every trade |
| Hype listings | The token is pushed onto exchanges mid-sale | **No listings during the sale.** Pool trading only after the sale ends |

## When the sale ends
The sale ends when all PPL is sold or after **24 months (730 days)**, whichever comes first. There is no raise target. Then:
1. The curve stops and sell-back closes.
2. **50% of the raise** goes to the liquidity share, locked for **24 months** (together with PPL at the last curve price it seeds a public pool at that price, with no jump).
3. The other **50%** goes to the project multisig, with public reporting of every spend.
4. Every PPL left unsold goes to the **Community Pool**.

There are no refunds. The transfer of unsold PPL to the Community Pool and the LP lock are executed by the project multisig under the published policy.

## Where the money goes
| Share | Destination |
|---|---|
| **50%** | Liquidity share, locked for 24 months |
| **50%** | Project multisig, with **public reporting** of every spend |
| Sell fees | PPL buyback |

## Security and the team's own tokens
**AI-assisted security reviews (not an external audit).** Bug bounty: report a vulnerability from the bug button on any page.\*\*\*

**Team vesting:** for the first **6 months** the team receives no tokens at all. After that the tokens unlock gradually, every month, over **18 more months** — 24 months in total.

## Which wallets work
MetaMask, Phantom, Trust Wallet, any wallet over WalletConnect, Tonkeeper (TON Connect), or simply **sign in with Google**. A Mainnet/Testnet switch lets you try everything on test tokens first.

---

## Small print
\* PPL is the utility token of the PEOPLE network. On the curve its price follows the published formula, and after the sale ends it is set by the market: it can fall as well as rise. PPL is not a security, not a share in a company, not a deposit and not an investment product, and no profit, yield or return of any kind is promised or guaranteed. Figures shown before a purchase are estimates computed from the published formula and are confirmed on-chain before you sign. Nothing on this page is investment, legal or tax advice.

\*\* Participation may be restricted or unavailable where you live, and checking the rules that apply to you is your own responsibility. Use only money you can afford to lose.

\*\*\* The AI-assisted reviews named above were carried out by the project team. They are not an audit by an external audit firm; a third-party security audit is completed before mainnet. A bug bounty reduces risk but does not remove it: no review can prove software free of defects.
