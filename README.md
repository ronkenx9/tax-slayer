# 🗡️ Tax Slayer Agent

> **The IRS never sleeps. Neither does your agent.**

Tax Slayer is an autonomous AI tax correspondent that lives inside Telegram. You pay $10 USDC. It scans your entire on-chain history across every major EVM chain, calculates FIFO cost basis, generates accountant-ready CSV + PDF reports, and then stays in chat to answer every follow-up question — jurisdiction-specific, number-accurate, no fluff.

No spreadsheets. No manual exports. No accountant waiting room.

---

## What It Actually Does

```
/report
  → Bot sends clickable x402 payment page
  → You pay $10 USDC on Ethereum
  → Paste your tx hash (or type "paid")
  → Send your EVM wallet address
  → Bot delivers CSV + PDF in under 60 seconds
  → Ask anything: "how much tax do I owe in Nigeria?"
  → Bot answers with your exact numbers
```

---

## Stack

| Layer | Tech |
|-------|------|
| Bot framework | Telegraf.js |
| AI brain | Groq — Llama 3.3 70B Versatile |
| On-chain data | Zerion REST API |
| Cost basis | FIFO (custom implementation) |
| PDF generation | pdf-lib |
| CSV generation | csv-writer |
| Payment protocol | x402 (USDC on Ethereum) |
| Hosting | Railway |

---

## Features

- **Multi-chain** — Ethereum, Base, Arbitrum, Polygon, Optimism, BSC, and more
- **FIFO cost basis** — calculated per asset per chain
- **Accountant-ready CSV** — import directly into Koinly, TurboTax, CoinTracker
- **PDF summary** — tax period, chains, inflows, outflows, realized PnL, top taxable events
- **AI follow-ups** — asks your jurisdiction, gives specific tax estimates (US short/long term, Nigeria CGT, UK CGT, etc.)
- **x402 payment gate** — dark-themed payment page with QR code, copy-address button, step-by-step instructions
- **Free tier** — ask any crypto tax question, browse 14-topic self-help guide — no payment needed
- **Session memory** — report context stays active for the full conversation, then auto-evicts after 2 hours

---

## Commands

| Command | Description | Cost |
|---------|-------------|------|
| `/start` | Welcome message + overview | Free |
| `/report` | Generate full on-chain tax report | $10 USDC |
| `/demo` | Sponsored demo — judges only | Free |
| `/guide` | Browse 14 crypto tax topics | Free |
| `/guide <n>` | Deep-dive on a specific topic | Free |
| `/tax <question>` | Ask any crypto tax question | Free |
| `/status` | Check your current session | Free |
| `/cancel` | Clear session | Free |

---

## Deploy Your Own

```bash
# 1. Clone
git clone https://github.com/ronkenx9/tax-slayer
cd tax-slayer/telegram

# 2. Install
npm install

# 3. Configure
cp .env.example .env
# Fill in: TELEGRAM_BOT_TOKEN, ZERION_API_KEY, PAYMENT_WALLET, GROQ_API_KEY, PUBLIC_URL

# 4. Deploy to Railway
# - Set ROOT_DIRECTORY to /telegram in Railway settings
# - Add all env vars
# - Deploy
```

### Required env vars

```
TELEGRAM_BOT_TOKEN=   # From @BotFather
ZERION_API_KEY=       # From zerion.io/developers
GROQ_API_KEY=         # From console.groq.com
PAYMENT_WALLET=       # Your USDC receiving address (0x...)
PUBLIC_URL=           # Your Railway domain (https://your-app.up.railway.app)
REPORT_PRICE_USD=10   # Optional, defaults to 10
```

---

## Architecture

```
User (Telegram)
    │
    ▼
Telegraf bot (telegram.ts)
    │
    ├── Payment flow ──► x402 server (Express) ──► payment page (/pay/:ref)
    │                         │
    │                         └── Zerion API (verify tx hash)
    │
    ├── Report flow ──► Zerion API (fetch 2025 txs, all EVM chains)
    │                       │
    │                       └── FIFO engine ──► csv-writer + pdf-lib ──► Telegram files
    │
    └── AI conversation ──► Groq (Llama 3.3 70B)
                                │
                                └── Report context injected ──► jurisdiction-specific answers
```

---

## Sponsors

Built for and sponsored by **[Open Wallet Standard (OWS)](https://openwallet.foundation)** Hackathon 2026.

x402 payment protocol — judge demo reports sponsored by OWS.

---

## License

MIT
