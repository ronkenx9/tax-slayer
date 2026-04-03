/**
 * Tax Slayer Agent — Telegram + x402 Entry Point
 *
 * Starts:
 *  1. x402 HTTP server  — payment page (/pay/:ref) + report endpoint (/report/:wallet)
 *  2. Telegram bot      — Telegraf polling
 *
 * Deploy on Railway. Set PUBLIC_URL to your Railway domain.
 * PORT is injected automatically by Railway.
 */

import 'dotenv/config';
import { startX402Server } from './src/x402-server.js';
import { startTelegramBot } from './telegram.js';

console.log('🗡️  Tax Slayer Agent starting...');
console.log(`   PORT       : ${process.env.PORT ?? '4402 (local)'}`);
console.log(`   PUBLIC_URL : ${process.env.PUBLIC_URL ?? '(not set — links will use localhost)'}`);
console.log(`   Telegram   : ${process.env.TELEGRAM_BOT_TOKEN ? '✅ token set' : '❌ TELEGRAM_BOT_TOKEN missing'}`);
console.log(`   Zerion     : ${process.env.ZERION_API_KEY ? '✅ key set' : '❌ ZERION_API_KEY missing'}`);
console.log(`   Moralis    : ${process.env.MORALIS_API_KEY ? '✅ key set' : '⚠️  no fallback'}`);
console.log(`   Payment    : ${process.env.PAYMENT_WALLET ?? '❌ PAYMENT_WALLET missing'}`);
console.log('');

startX402Server();
startTelegramBot();
