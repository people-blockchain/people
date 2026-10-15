# The PPL Sale: how it works

## In one paragraph
100,000,000 PPL (10% of the fixed 1 billion supply) are sold on a public price curve. The price starts at **$0.005** and rises as more PPL is bought, up to a hard ceiling of **$0.25**. You can buy and sell on the curve at any time. When the sale has raised **$4,000,000**, it "graduates": half of the money, together with the matching amount of PPL, goes into a public trading pool that is locked for 24 months, and trading continues there.

## How the curve works
The price is not set by hand. It is set by a published formula. Every purchase moves the price up a little, and every sale back into the curve moves it down by the same rule. Anyone can check the current price and how much has been sold at any moment.

- Starting price: **$0.005**
- Price ceiling: **$0.25**. It is reached only if all 100M PPL are sold. The price can never go above it on the curve.
- Graduation: at **$4M raised**, which is roughly $0.16 per PPL. The curve closes before the price reaches the ceiling.
- Sale window: **180 days**.

**Important:** the $0.25 ceiling applies on the curve only, while the sale is running. After the move to the pool, the price is set by a free market, with no limit up or down.

You pay with USDC or USDT from Ethereum, BNB Chain, Polygon, Arbitrum and Base, or with stablecoins on TON, Tron and Solana. Whatever network you pay from, there is **one single curve and one price for everyone**.

## Why early is cheaper
The curve is a ramp. The first buyers buy at the bottom, where the price is lowest. Later buyers pay more because some PPL has already been taken. That is the whole benefit of being early: a lower price, set by a formula everyone can see in advance.\*

## Buying and selling
- **Buy:** choose your network and stablecoin, enter an amount, and see exactly how much PPL you get before you confirm.
- **Changed your mind?** Sell PPL back to the curve at any time at the current price, minus a **1.5%** fee. The fee goes to **PPL buyback**, not to the team. Sell-back payout comes in **USDC on Base** (Coinbase's network; USDC issued by Circle, the same dollar as on Ethereum or Polygon, only faster and cheaper). Or choose your own network; the bridge takes a few minutes.
- **Slippage protection:** every trade has a minimum-received amount. If the price moves too much before your transaction lands, it is cancelled instead of filling at a worse price.

## Why this is not a pyramid
- **No promised returns.** Nobody is promised a profit, a percentage or a payout.
- **No payouts from new buyers to old buyers.** Your money buys PPL at the formula price; it is not passed to people who came earlier.
- **No recruiting rewards.** You get nothing for bringing in other buyers.
- **You hold what you bought.** PPL is recorded to you on the People network the moment you buy, and you can sell it back to the curve. PPL transfers to other people and pool trading open with the full network launch: at 1,000 verified participants, and no later than 6 months.
- **Public rules.** The price formula, the ceiling, the graduation point and where the money goes are fixed and published before the start.

## What goes wrong on curves without a ceiling, and what we do differently
Bonding curves became popular through launchpads like pump.fun. Their uncapped curves have well-known problems:

| Problem | What happens | Our protection |
|---|---|---|
| Late buyers overpay | The price can run up without limit, so the last buyers before graduation pay many times what the first did | **Hard ceiling of $0.25.** The curve closes at $4M, around $0.16 |
| Snipers and bots | Scripts buy in the first seconds from many wallets and then sell to real people | **Up to $500 per purchase**, **up to $2,000 per person per day**, a **1-minute pause** between trades. If bots show up, the multisig can switch on a "verified only" mode |
| Dumps | Large holders sell everything at once and crash the price | Per-person limits stop anyone building a large position. The **sell fee** goes to PPL buyback. Liquidity after graduation is **locked for 24 months** and cannot be pulled |
| Front-running and bad fills | A trade fills at a price much worse than the one shown | **Slippage protection** on every trade |
| Hype listings | The token is pushed onto exchanges mid-sale | **No listings during the sale.** DEX trading only after graduation |

## Graduation: from curve to pool
When **$4,000,000** has been raised:
1. The curve stops.
2. **50% of the raise ($2M)** plus PPL from the liquidity reserve, priced at the last curve price, go into a public DEX pool. Trading opens at the same price where the curve ended, with no jump.
3. The pool's LP tokens are **locked for 24 months**.
4. Trading continues on the DEX.

PPL left unsold on the curve (around 11M at a $4M graduation) goes to the **community pool**.

If $4M is not raised within **180 days**, graduation happens with whatever was raised: 50% into the liquidity pool, 50% to the multisig, and unsold PPL to the **community pool**.

## Where the money goes
| Share | Destination |
|---|---|
| **50%** | DEX liquidity pool, locked for 24 months |
| **50%** | Project multisig, with **public reporting** of every spend |
| Sell fees | PPL buyback |

## Security and the team's own tokens
**Audited by: Claude Opus 5.5, GPT Astra, Fable 5.1.** Bug bounty: report a vulnerability from the bug button on any page.\*\*\*

**Team vesting:** for the first **6 months** the team receives no tokens at all. After that the tokens unlock gradually, every month, over **18 more months** — 24 months in total.

## Which wallets work
MetaMask, Phantom, Trust Wallet, any wallet over WalletConnect, Tonkeeper (TON Connect), or simply **sign in with Google**. A Mainnet/Testnet switch lets you try everything on test tokens first.

---

## Small print
\* PPL is the utility token of the People network. On the curve its price follows the published formula, and after graduation it is set by the market: it can fall as well as rise. PPL is not a security, not a share in a company, not a deposit and not an investment product, and no profit, yield or return of any kind is promised or guaranteed. Figures shown before a purchase are estimates computed from the published formula and are confirmed on-chain before you sign. Nothing on this page is investment, legal or tax advice.

\*\* Participation may be restricted or unavailable where you live, and checking the rules that apply to you is your own responsibility. Use only money you can afford to lose.

\*\*\* The AI-assisted reviews named above were carried out by the project team. They are not an audit by an external audit firm; a third-party security audit is completed before mainnet. A bug bounty reduces risk but does not remove it: no review can prove software free of defects.
