# 🗡️ Tax Slayer — Unified AI Agent

**The IRS never sleeps. Neither does your agent.**

Tax Slayer is a dual-platform conversational AI agent built for the **OWS Hackathon 2026**. This repository contains both the Telegram and WhatsApp bot implementations in a unified monorepo structure.

## 📁 Repository Structure
- **`/telegram`**: Standalone Telegram bot and x402 payment server. Deploy this to Railway.
- **`/whatsapp`**: WhatsApp bot implementation via Baileys.
- **`index.html`**: The cinematic project landing page.

## ✨ Core Features
- **Conversational Brain**: Powered by Groq (Llama 3.3 70B) for instant, human-like tax guidance.
- **On-chain Intelligence**: Real-time transaction fetching via **Moralis** and **Zerion**.
- **x402 Micropayments**: Frictionless $10 USDC report generation.
- **Accountant-Ready**: CSV and PDF summary reports delivered directly to chat.

## 🚀 Deployment (Telegram)
1. `cd telegram`
2. `npm install`
3. Configure `.env` (see `.env.example`)
4. Deploy to Railway.

## 📄 License
MIT — Built for Open Wallet Standard Hackathon 2026.
