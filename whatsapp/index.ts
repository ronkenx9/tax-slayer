import 'dotenv/config';
import qrcode from 'qrcode-terminal';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
  type WASocket,
  type proto,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { fetchTaxReport } from './src/zerion.js';         // Zerion x402 via mp
import { generateReports } from './src/report.js';
import { initiatePayment, checkPayment, verifyTxHash, extractTxHash, type PaymentSession } from './src/payment.js';
import { startX402Server } from './src/x402-server.js';
import * as fs from 'fs';
import { processMessage } from './src/agent.js';
import {
  getFreeTierWelcome,
  getTaxGuideMenu,
  getTaxGuide,
} from './src/knowledge.js';
import { startTelegramBot } from './telegram.js';

// ─── Session State ────────────────────────────────────────────────────────────

interface Session {
  wallet?: string;
  paymentRef?: string;
  paymentSession?: PaymentSession;
  paid: boolean;
  waitingFor?: 'wallet' | 'payment_confirm';
  tier: 'free' | 'paid';
  history: Array<{ role: string; content: string }>;
}

const sessions = new Map<string, Session>();

function getSession(jid: string): Session {
  if (!sessions.has(jid)) {
    sessions.set(jid, { paid: false, tier: 'free', history: [] });
  }
  return sessions.get(jid)!;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractWalletAddress(text: string): string | null {
  const evm = text.match(/0x[a-fA-F0-9]{40}/);
  if (evm) return evm[0];
  const sol = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
  if (sol) return sol[0];
  return null;
}

function getMessageText(msg: proto.IWebMessageInfo): string {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    ''
  ).trim();
}

function isGreeting(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return (
    lower === 'hi' || lower === 'hello' || lower === 'hey' || lower === 'start' ||
    lower === 'help' || lower === 'begin' ||
    lower.startsWith('hi ') || lower.startsWith('hello ')
  );
}

function isGuide(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return lower === 'guide' || lower === 'menu' || lower === 'topics' ||
    lower.includes('self help') || lower.includes('what can you');
}

function isTopicNumber(text: string): string | null {
  const match = text.trim().match(/^(\d{1,2})$/);
  return match ? match[1] : null;
}

function isPaidTierIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('report') || lower.includes('generate') ||
    lower.includes('export') || lower.includes('tax report') ||
    /0x[a-fA-F0-9]{40}/.test(text)
  );
}

function buildPaymentMessage(ps: PaymentSession): string {
  return (
    `💳 *Payment Required*\n\n` +
    `Report fee: *$${ps.amountUSD} USDC* on Ethereum\n\n` +
    `📬 *Send to:*\n\`${ps.paymentAddress}\`\n\n` +
    `🔍 Verify address: ${ps.paymentUrl}\n\n` +
    `After sending, reply with your *transaction hash* (starts with 0x...).\n` +
    `_Or just reply_ *paid* _and I'll check automatically._\n\n` +
    `Reference: \`${ps.ref}\` | Expires in 30 min\n` +
    `Type *cancel* to abort.`
  );
}

// ─── Core Message Handler ─────────────────────────────────────────────────────

async function handleMessage(sock: WASocket, msg: proto.IWebMessageInfo) {
  const jid = msg.key.remoteJid!;
  if (!jid || msg.key.fromMe) return;

  const text = getMessageText(msg);
  if (!text) return;

  const session = getSession(jid);

  // ── 1. Greeting / first message ───────────────────────────────────────────
  if (isGreeting(text) || !sessions.has(jid)) {
    sessions.set(jid, session);
    await sock.sendMessage(jid, { text: getFreeTierWelcome() });
    return;
  }

  // ── 2. Guide menu ──────────────────────────────────────────────────────────
  if (isGuide(text)) {
    await sock.sendMessage(jid, { text: getTaxGuideMenu() });
    return;
  }

  // ── 3. Topic number / guide deep-dive ─────────────────────────────────────
  const topicNum = isTopicNumber(text);
  if (topicNum) {
    const answer = getTaxGuide(topicNum);
    if (answer) {
      await sock.sendMessage(jid, { text: answer });
      return;
    }
  }

  // ── 4. Cancel ─────────────────────────────────────────────────────────────
  if (text.toLowerCase() === 'cancel') {
    sessions.delete(jid);
    await sock.sendMessage(jid, { text: '❌ Cancelled. Type *guide* for topics or *generate report* to start again.' });
    return;
  }

  // ── 5. Waiting for wallet address ─────────────────────────────────────────
  if (session.waitingFor === 'wallet') {
    const wallet = extractWalletAddress(text);
    if (!wallet) {
      await sock.sendMessage(jid, {
        text: "❌ Couldn't find a wallet address. Please send your EVM address (0x...) or Solana address.",
      });
      return;
    }
    session.wallet = wallet;
    session.waitingFor = undefined;
    session.tier = 'paid';
    sessions.set(jid, session);
    await startPaymentFlow(sock, jid, wallet);
    return;
  }

  // ── 6. Waiting for payment confirmation ───────────────────────────────────
  if (session.waitingFor === 'payment_confirm' && session.paymentSession) {
    const lower = text.toLowerCase();

    // Check if user pasted a tx hash — most reliable verification
    const txHash = extractTxHash(text);
    if (txHash) {
      await sock.sendMessage(jid, { text: `🔍 Got your tx hash. Verifying on-chain via Zerion...` });
      const verified = await verifyTxHash(txHash, session.paymentSession);
      if (verified) {
        session.paid = true;
        session.tier = 'paid';
        session.waitingFor = undefined;
        sessions.set(jid, session);
        await generateAndSendReport(sock, jid, session.wallet!);
      } else {
        await sock.sendMessage(jid, {
          text: '❌ Could not verify that tx. Make sure:\n• You sent *USDC* (not ETH)\n• On *Ethereum* mainnet\n• Amount is $10\n• Tx is confirmed\n\nPaste the tx hash again or reply *resend link*.',
        });
      }
      return;
    }

    if (lower.includes('paid') || lower.includes('done') || lower.includes('sent')) {
      await sock.sendMessage(jid, { text: '🔍 Checking for your payment on-chain...' });
      const verified = await checkPayment(session.paymentSession);
      if (verified) {
        session.paid = true;
        session.tier = 'paid';
        session.waitingFor = undefined;
        sessions.set(jid, session);
        await generateAndSendReport(sock, jid, session.wallet!);
      } else {
        await sock.sendMessage(jid, {
          text: '⏳ Payment not found yet — transactions take 1–2 mins to confirm.\n\nFor faster verification, paste your *transaction hash* (0x...). Or wait and reply *paid* again.\n\nType *resend link* for the payment details.',
        });
      }
      return;
    }
    if (lower.includes('resend') || lower.includes('link')) {
      await sock.sendMessage(jid, { text: buildPaymentMessage(session.paymentSession) });
      return;
    }
    if (lower.includes('cancel')) {
      sessions.delete(jid);
      await sock.sendMessage(jid, { text: '❌ Cancelled. Type *generate report* anytime to restart.' });
      return;
    }
  }

  // ── 7. Paid-tier intent (wallet detected or report keyword) ───────────────
  if (isPaidTierIntent(text)) {
    const wallet = extractWalletAddress(text);
    if (wallet) {
      session.wallet = wallet;
      session.paid = false;
      session.tier = 'paid';
      sessions.set(jid, session);
      await startPaymentFlow(sock, jid, wallet);
    } else {
      session.waitingFor = 'wallet';
      session.tier = 'paid';
      sessions.set(jid, session);
      await sock.sendMessage(jid, {
        text: '🧾 *Tax Report — Paid Tier*\n\nFee: *$10 USDC* — you get a full CSV + PDF with FIFO cost basis.\n\nPlease send your wallet address:\n• EVM: `0x...`\n• Solana: base58 address',
      });
    }
    return;
  }

  // ── 8. Free tier — full conversational AI agent ───────────────────────────
  try {
    session.history.push({ role: 'user', content: text });
    sessions.set(jid, session);

    const response = await processMessage(text, { history: session.history });

    // Handle guide intents from AI
    if (response.intent === 'guide_request') {
      await sock.sendMessage(jid, { text: getTaxGuideMenu() });
      return;
    }
    if (response.intent === 'guide_topic' && response.guideTopic) {
      const guide = getTaxGuide(response.guideTopic);
      await sock.sendMessage(jid, { text: guide ?? response.text });
      return;
    }
    if (response.intent === 'report_request' || response.walletAddress) {
      if (response.walletAddress) {
        session.wallet = response.walletAddress;
        session.paid = false;
        session.tier = 'paid';
        sessions.set(jid, session);
        await startPaymentFlow(sock, jid, response.walletAddress);
        return;
      }
      session.waitingFor = 'wallet';
      sessions.set(jid, session);
      await sock.sendMessage(jid, {
        text: '🧾 Sure! To generate your tax report, send me your wallet address (0x... for EVM or base58 for Solana).',
      });
      return;
    }

    const replyText = response.text || "I'm not sure about that — try asking a specific crypto tax question or type *guide* for topics!";
    session.history.push({ role: 'assistant', content: replyText });
    sessions.set(jid, session);
    await sock.sendMessage(jid, { text: replyText });

  } catch (err) {
    console.error('[WhatsApp] handler error:', err);
    await sock.sendMessage(jid, {
      text: "Something went wrong on my end — try again in a second. If it keeps happening, type *guide* to browse topics manually.",
    });
  }
}

// ─── Payment Flow ─────────────────────────────────────────────────────────────

async function startPaymentFlow(sock: WASocket, jid: string, wallet: string) {
  const session = getSession(jid);

  await sock.sendMessage(jid, {
    text: `✅ Wallet received: \`${wallet}\`\n\n⚙️ Preparing your payment link...`,
  });

  const paymentSession = await initiatePayment(wallet);
  session.paymentSession = paymentSession;
  session.waitingFor = 'payment_confirm';
  sessions.set(jid, session);

  await sock.sendMessage(jid, { text: buildPaymentMessage(paymentSession) });
}

// ─── Report Generation & Delivery ────────────────────────────────────────────

async function generateAndSendReport(sock: WASocket, jid: string, wallet: string) {
  await sock.sendMessage(jid, {
    text: '🔄 Payment confirmed! Pulling your on-chain history via Moralis...\n\n_20–60 seconds for wallets with many transactions._',
  });

  let txData;
  try {
    txData = await fetchTaxReport(wallet);
  } catch (err) {
    await sock.sendMessage(jid, {
      text: `❌ Failed to fetch transaction data: ${(err as Error).message}\n\nPlease try again or contact support.`,
    });
    return;
  }

  if (txData.transactions.length === 0) {
    await sock.sendMessage(jid, {
      text: `⚠️ No transactions found for \`${wallet}\` in 2025.\n\nCheck the address is correct and try again.`,
    });
    return;
  }

  await sock.sendMessage(jid, {
    text: `📊 Found *${txData.transactions.length} transactions* across ${txData.chains.join(', ')}.\n\n⚙️ Generating CSV + PDF...`,
  });

  let paths;
  try {
    paths = await generateReports(wallet, txData);
  } catch (err) {
    await sock.sendMessage(jid, {
      text: `❌ Report generation failed: ${(err as Error).message}\n\nPlease try again.`,
    });
    return;
  }

  // Send CSV
  await sock.sendMessage(jid, {
    document: fs.readFileSync(paths.csv),
    mimetype: 'text/csv',
    fileName: `TaxSlayer-${wallet.slice(0, 8)}-2025.csv`,
    caption: '📊 Full transaction CSV — import into Koinly, TurboTax, CoinTracker',
  });

  // Send PDF
  await sock.sendMessage(jid, {
    document: fs.readFileSync(paths.pdf),
    mimetype: 'application/pdf',
    fileName: `TaxSlayer-${wallet.slice(0, 8)}-2025-Summary.pdf`,
    caption: '📋 Summary PDF — accountant-ready report',
  });

  // Summary text
  const { summary } = txData;
  const pnl = summary.totalPnL >= 0 ? `+$${summary.totalPnL.toFixed(2)}` : `-$${Math.abs(summary.totalPnL).toFixed(2)}`;
  await sock.sendMessage(jid, {
    text: [
      '✅ *Tax Report Complete*',
      '',
      `Wallet: \`${wallet}\``,
      `Period: ${summary.periodStart} → ${summary.periodEnd}`,
      `Chains: ${txData.chains.join(', ')}`,
      '',
      '📈 *Summary*',
      `• Total transactions: ${txData.transactions.length}`,
      `• Taxable events: ${summary.taxableEvents}`,
      `• Total inflows: $${summary.totalInflows.toFixed(2)}`,
      `• Total outflows: $${summary.totalOutflows.toFixed(2)}`,
      `• Realized PnL: ${pnl}`,
      '',
      '📂 Both files attached above.',
      '',
      '_Generated by Tax Slayer Agent via Moralis + OWS + x402_',
      '_Type "generate report" anytime to run another._',
    ].join('\n'),
  });

  // Cleanup
  try { fs.unlinkSync(paths.csv); } catch { /* noop */ }
  try { fs.unlinkSync(paths.pdf); } catch { /* noop */ }
  sessions.delete(jid);
}

// ─── Socket Setup ─────────────────────────────────────────────────────────────

let reconnectDelay = 3000;

async function startBot() {
  const logger = pino({ level: 'silent' });
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  startX402Server();
  startTelegramBot();

  const { version } = await fetchLatestBaileysVersion();
  console.log(`[WhatsApp] Connecting with version ${version.join('.')}`);

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: true,
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    connectTimeoutMs: 60_000,
    keepAliveIntervalMs: 10_000,
    retryRequestDelayMs: 250,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      reconnectDelay = 3000;
      console.clear();
      console.log('\n🔐 Tax Slayer Agent — Scan to connect:\n');
      qrcode.generate(qr, { small: true });
      console.log('\nWhatsApp → ⋮ → Linked Devices → Link a Device\n');
    }

    if (connection === 'open') {
      reconnectDelay = 3000;
      console.log('✅ Tax Slayer WhatsApp connected!\n');
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`Connection closed (${statusCode}). Reconnecting in ${reconnectDelay / 1000}s...`);
      if (shouldReconnect) {
        setTimeout(startBot, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
      } else {
        console.log('Logged out. Delete auth_info/ and restart to re-link.');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message) continue;
      try {
        await handleMessage(sock, msg);
      } catch (err) {
        console.error('[WhatsApp] Message handler error:', err);
      }
    }
  });

  return sock;
}

// ─── Entry ────────────────────────────────────────────────────────────────────

console.log('🚀 Tax Slayer Agent starting...');
startBot().catch(console.error);
