# Abyss Protocol — ETHGlobal HackMoney Pitch

## 🎯 Tagline
**"Private intent-based trading on Sui — from Telegram to DeepBook, powered by NEAR Intents."**

---

## 🎤 SPEAKER 1 — You (2 min 30 sec)
### Theme: NEAR Intents + Telegram Bot + Mini App

---

**[OPEN — Hook — 15 sec]**

Imagine you're on Telegram. You type: *"swap 1 NEAR for SUI."* That's it. No bridge UI. No wallet switching. No five-tab nightmare. In under a minute, SUI lands in your wallet — across chains, zero friction. That's Abyss Protocol.

---

**[PROBLEM — 20 sec]**

Cross-chain trading today is broken. You need to find a bridge, approve tokens, wait for finality, switch RPCs, pray nothing fails. And if you want to do it from mobile? Forget it. There's no simple, conversational, cross-chain trading experience — especially not one that lives where users already are: Telegram.

---

**[WHAT WE BUILT — 30 sec]**

We built Abyss Protocol — a private, intent-based trading platform on Sui that you can use entirely from Telegram.

At its core, we integrated **NEAR Intents** — specifically the **1-Click API** — to unlock cross-chain swaps across **15+ blockchains** including Sui, Ethereum, Arbitrum, Solana, and Bitcoin. The user never leaves Telegram. They speak naturally — *"swap 100 USDC for ETH"* — and our **AI agent** parses that into a structured intent, fetches a live quote, and executes the swap end-to-end.

---

**[HOW NEAR INTENTS WORKS IN OUR STACK — 40 sec]**

Here's how we wired it together:

We built a **full TypeScript wrapper** around the NEAR Intents 1-Click REST API — handling token discovery, quote generation, deposit routing, and status polling.

On top of that, we built a **natural language intent parser** — our AI agent understands aliases like "bitcoin" → BTC, "ether" → ETH, resolves chains, and maps user messages to swap actions. It supports cross-chain routing like SUI-to-ETH or NEAR-to-SOL without the user understanding any of the underlying mechanics.

For the Telegram bot, we used **grammY** and built commands like `/swap`, `/balance`, `/fund`, `/connect`, and also **free-form natural language** — just type what you want and the AI agent handles it.

For wallet management, we integrated **Privy** — the bot-first approach. When a user types `/connect`, we create a **Privy-managed NEAR ed25519 wallet**, linked to their Telegram ID. The bot can then auto-sign deposits server-side, or the user can connect their own NEAR wallet and sign through our **Telegram Mini App** — a full Next.js web app that opens right inside Telegram.

---

**[ON-CHAIN INTENTS — 25 sec]**

But we didn't stop at cross-chain swaps. We also built **on-chain encrypted intents on Sui**.

Users create conditional trading orders — like *"buy SUI if price drops below $3"* — and we **encrypt that intent using Mysten's Seal** with identity-based encryption. Only a registered **Nautilus TEE enclave** can decrypt and execute it. We wrote two Move smart contracts: an **intent registry** and a **Seal access policy** — both deployed on Sui testnet.

---

**[CLOSE — 20 sec]**

So in summary: you open Telegram, you talk to our bot like a human, and behind the scenes, NEAR Intents routes your trade across chains, Privy manages your keys, Seal encrypts your strategy, and it all runs on Sui. That's Abyss Protocol — cross-chain, private, conversational trading.

Now let me hand it over to my teammate who'll walk you through our DeepBook integration and the indexer.

---

---

## 🎤 SPEAKER 2 — Your Friend (1 min 30 sec)
### Theme: DeepBook V3 Indexer + Trading Features

---

**[OPEN — 10 sec]**

Thanks! So we've covered how users get into Abyss from Telegram. Now let me show you what happens when they want to **trade on Sui natively** — using **DeepBook V3**, Sui's native central limit order book.

---

**[THE INDEXER — 30 sec]**

We built a **real-time DeepBook indexer** — a full market dashboard that pulls live data from the DeepBook V3 indexer API on both **testnet and mainnet**.

You can browse every trading pool — SUI/USDC, DEEP/SUI, WAL/USDC — and see **live prices, 24-hour volume, price change, best bid/ask, spread, and liquidity depth**. We built a filtering system with search, sort by volume or price change, filter by gainers or losers, and toggle between base currencies. Each pool card links to a detailed page with **candle charts** using Lightweight Charts for full price history visualization.

We also have an **assets view** — browse every token registered on DeepBook with deposit and withdrawal capabilities.

---

**[TRADING FEATURES — 30 sec]**

On top of the indexer, we built a complete **DeFi Trading Hub**:

- **Swaps**: instant token swaps across DeepBook pools with optimal routing
- **Balance Manager**: create and manage your DeepBook V3 balance manager, deposit tokens, mint trade caps
- **Flash Arbitrage**: zero-capital atomic arbitrage across pools — borrow, arb, repay in a single transaction
- **Margin Trading**: up to 20x leverage using DeepBook liquidity with auto-liquidation protection
- **Limit Orders**: encrypted conditional orders with stop-loss and take-profit, executed by the Nautilus enclave

All of this works with both **zkLogin** and **traditional wallet connectors** through DappKit.

---

**[CLOSE — 20 sec]**

So to tie it together — Abyss Protocol gives you: a **Telegram bot** for conversational cross-chain swaps via NEAR Intents, a **full DeFi trading hub** powered by DeepBook V3, **encrypted intents** secured by Seal and Nautilus, and everything connected through **one unified Next.js app** you can open right inside Telegram.

We're building the trading UX that DeFi deserves. Thank you!

---

---

## 📋 Quick Reference — Key Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | **Sui** (Move smart contracts) |
| Cross-chain | **NEAR Intents** 1-Click API |
| Order Book | **DeepBook V3** SDK |
| Encryption | **Mysten Seal** (IBE) |
| Execution | **Nautilus TEE** |
| Wallet (Telegram) | **Privy** (Bot-First, ed25519 NEAR wallets) |
| Wallet (Web) | **zkLogin** + **DappKit** |
| NEAR Wallet | **@hot-labs/near-connect** |
| Telegram Bot | **grammY** |
| Frontend | **Next.js 16**, React 19, TailwindCSS |
| Charts | **Lightweight Charts**, ApexCharts |

---

## 🔥 One-Liner Pitches (for judges walking by)

- *"We let you trade across 15 chains from a Telegram message."*
- *"Private intent-based DeFi on Sui — just tell our bot what you want."*
- *"Cross-chain swaps in Telegram, encrypted strategies on Sui, DeepBook execution under the hood."*

---

## ⏱ Timing Guide

| Section | Speaker | Duration |
|---|---|---|
| Hook | You | 15 sec |
| Problem | You | 20 sec |
| What we built | You | 30 sec |
| NEAR Intents deep-dive | You | 40 sec |
| On-chain encrypted intents | You | 25 sec |
| Transition | You | 20 sec |
| **You total** | | **~2 min 30 sec** |
| DeepBook indexer intro | Friend | 10 sec |
| Indexer walkthrough | Friend | 30 sec |
| Trading features | Friend | 30 sec |
| Close | Friend | 20 sec |
| **Friend total** | | **~1 min 30 sec** |
| **GRAND TOTAL** | | **~4 min** |

---

## 💡 Presentation Tips

1. **Demo while you talk** — have the Telegram bot open on your phone, show a live swap during your section
2. **Show the Mini App** — open it inside Telegram to prove it works natively
3. **Friend: screen share the indexer** — scroll through live pools, click into a candle chart, show the trading hub
4. **Keep energy high** — this is a hackathon, enthusiasm wins
5. **End with the one-liner**: *"We're building the trading UX that DeFi deserves."*
