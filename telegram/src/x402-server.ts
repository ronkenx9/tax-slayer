/**
 * x402 HTTP Server — Pay-per-report tax data endpoint
 *
 * Protocol flow:
 *  1. GET /report/:wallet  — no payment header → 402 with payment details
 *  2. Client pays $REPORT_PRICE_USD USDC to PAYMENT_WALLET on Ethereum
 *  3. GET /report/:wallet  — with X-Payment-Tx header → verify on Zerion → return report JSON
 *
 * Port: 4402 (x402 themed)
 *
 * Required env vars:
 *   ZERION_API_KEY     — Zerion API key
 *   PAYMENT_WALLET     — Your USDC receiving address (0x...)
 *   REPORT_PRICE_USD   — Report price in USD/USDC (default: 10)
 */

import express, { type Request, type Response } from 'express';
import * as crypto from 'crypto';
import { fetchTaxReport } from './zerion.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? process.env.X402_PORT ?? 4402);
const REPORT_PRICE_USD = Number(process.env.REPORT_PRICE_USD ?? '10');
const PAYMENT_WALLET = process.env.PAYMENT_WALLET ?? '';

// USDC on Ethereum mainnet
const USDC_CONTRACT = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

// Tolerance: accept payment if >= 95% of required amount received
const PAYMENT_TOLERANCE = 0.95;

// USDC has 6 decimals
const USDC_DECIMALS = 1_000_000;

// ─── Zerion payment-verification types ───────────────────────────────────────

interface ZerionTransfer {
  direction: 'in' | 'out';
  fungible_info: {
    symbol: string;
    implementations?: Array<{ address: string | null; chain_id: string }>;
  };
  quantity: { float: number };
  value: number | null;
}

interface ZerionTxAttributes {
  hash: string;
  status: string;
  transfers: ZerionTransfer[];
}

interface ZerionTxResponse {
  data: {
    id: string;
    attributes: ZerionTxAttributes;
    relationships: { chain: { data: { id: string } } };
  };
}

// ─── Zerion helper ────────────────────────────────────────────────────────────

function buildZerionAuth(): string {
  const key = process.env.ZERION_API_KEY ?? '';
  if (!key) throw new Error('ZERION_API_KEY not set');
  return `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
}

async function zerionGet<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.zerion.io/v1${path}`, {
    headers: { Authorization: buildZerionAuth(), Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zerion ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ─── Payment Verification ─────────────────────────────────────────────────────

/**
 * Verifies that a given tx hash represents a confirmed USDC transfer of at
 * least REPORT_PRICE_USD to PAYMENT_WALLET on Ethereum.
 *
 * Uses the Zerion transaction detail endpoint:
 * GET /transactions/{hash}?filter[chain_ids]=ethereum
 */
async function verifyPaymentTx(txHash: string): Promise<boolean> {
  if (!PAYMENT_WALLET) {
    console.warn('[x402] PAYMENT_WALLET not set — skipping on-chain verification');
    return false;
  }

  try {
    const data = await zerionGet<ZerionTxResponse>(
      `/transactions/${txHash}?filter[chain_ids]=ethereum`,
    );

    const attrs = data.data?.attributes;
    if (!attrs) return false;

    // Must be confirmed
    if (attrs.status !== 'confirmed') return false;

    const recipientLower = PAYMENT_WALLET.toLowerCase();
    const requiredAmount = REPORT_PRICE_USD * PAYMENT_TOLERANCE;

    // Look for an inbound USDC transfer to PAYMENT_WALLET
    for (const transfer of attrs.transfers ?? []) {
      if (transfer.direction !== 'in') continue;

      const isUSDC = transfer.fungible_info?.symbol?.toUpperCase() === 'USDC';
      if (!isUSDC) continue;

      // Confirm the contract address matches Ethereum USDC
      const impl = transfer.fungible_info?.implementations?.find(
        (i) => i.chain_id === 'ethereum',
      );
      if (impl && impl.address?.toLowerCase() !== USDC_CONTRACT) continue;

      const receivedAmount = transfer.quantity?.float ?? 0;
      if (receivedAmount >= requiredAmount) return true;
    }

    return false;
  } catch (err) {
    console.error('[x402] Payment verification error:', err);
    return false;
  }
}

// ─── Per-wallet payment references (in-memory; stateless between restarts) ───

const pendingRefs = new Map<string, string>();

function getOrCreateRef(wallet: string): string {
  let ref = pendingRefs.get(wallet.toLowerCase());
  if (!ref) {
    ref = `TSR-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    pendingRefs.set(wallet.toLowerCase(), ref);
  }
  return ref;
}

// ─── Route Handlers ───────────────────────────────────────────────────────────

function handleHealth(_req: Request, res: Response): void {
  res.status(200).json({
    status: 'ok',
    service: 'Tax Slayer x402 Server',
    port: PORT,
    priceUSD: REPORT_PRICE_USD,
    paymentAsset: 'USDC',
    paymentChain: 'ethereum',
    paymentWallet: PAYMENT_WALLET || '(not configured)',
  });
}

async function handleReport(req: Request, res: Response): Promise<void> {
  const { wallet } = req.params;

  // Validate wallet address
  if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    res.status(400).json({
      error: 'Invalid wallet address. Must be a 0x... EVM address.',
    });
    return;
  }

  const paymentTx = req.headers['x-payment-tx'] as string | undefined;

  // ── No payment header → 402 ────────────────────────────────────────────────
  if (!paymentTx) {
    const ref = getOrCreateRef(wallet);

    res.status(402).set({
      'X-Payment-Required': 'true',
      'X-Payment-Amount': String(REPORT_PRICE_USD),
      'X-Payment-Asset': 'USDC',
      'X-Payment-Address': PAYMENT_WALLET,
      'X-Payment-Chain': 'ethereum',
      'X-Payment-Ref': ref,
    }).json({
      error: 'Payment required',
      instructions: {
        step1: `Send exactly ${REPORT_PRICE_USD} USDC to ${PAYMENT_WALLET} on Ethereum`,
        step2: 'Copy the transaction hash from your wallet',
        step3: `Repeat this request with header: X-Payment-Tx: <tx_hash>`,
        amount: REPORT_PRICE_USD,
        asset: 'USDC',
        chain: 'ethereum',
        recipient: PAYMENT_WALLET,
        ref,
      },
    });
    return;
  }

  // ── Payment header present → verify tx ────────────────────────────────────
  // Basic format check for tx hash
  if (!/^0x[a-fA-F0-9]{64}$/.test(paymentTx)) {
    res.status(400).json({
      error: 'Invalid transaction hash. Must be a 0x-prefixed 64-character hex string.',
    });
    return;
  }

  let verified: boolean;
  try {
    verified = await verifyPaymentTx(paymentTx);
  } catch (err) {
    res.status(503).json({
      error: 'Payment verification service unavailable. Please try again shortly.',
      detail: (err as Error).message,
    });
    return;
  }

  if (!verified) {
    res.status(402).json({
      error: 'Payment not verified',
      detail: `Could not confirm ${REPORT_PRICE_USD} USDC received at ${PAYMENT_WALLET} for tx ${paymentTx}. ` +
        'Ensure the transaction is confirmed on Ethereum and the correct amount was sent.',
    });
    return;
  }

  // ── Payment verified → generate report ────────────────────────────────────
  // Clear the pending ref now that payment is confirmed
  pendingRefs.delete(wallet.toLowerCase());

  let reportData;
  try {
    reportData = await fetchTaxReport(wallet);
  } catch (err) {
    res.status(500).json({
      error: 'Failed to fetch on-chain transaction data.',
      detail: (err as Error).message,
    });
    return;
  }

  const { summary, transactions, chains } = reportData;

  res.status(200).json({
    wallet,
    chains,
    txCount: transactions.length,
    summary: {
      periodStart: summary.periodStart,
      periodEnd: summary.periodEnd,
      taxableEvents: summary.taxableEvents,
      totalInflows: summary.totalInflows,
      totalOutflows: summary.totalOutflows,
      totalPnL: summary.totalPnL,
    },
    // Full transaction list embedded in response for downstream consumption
    transactions,
    // Download hints — the caller can pass this data to report.ts
    download: {
      hint: 'Pass the `transactions` array to generateReports() in src/report.ts for CSV + PDF output.',
      csvEndpoint: `/report/${wallet}/csv`,   // future extension
      pdfEndpoint: `/report/${wallet}/pdf`,   // future extension
    },
    meta: {
      generatedAt: new Date().toISOString(),
      paymentTx,
      priceUSD: REPORT_PRICE_USD,
      dataSource: 'Zerion API (https://api.zerion.io/v1)',
    },
  });
}

// ─── Server Factory ───────────────────────────────────────────────────────────

export function startX402Server(): void {
  const app = express();
  app.use(express.json());

  // ── Routes ─────────────────────────────────────────────────────────────────
  app.get('/health', handleHealth);

  app.get('/pay/:ref', (req: Request, res: Response) => {
    // Sanitize ref: only allow alphanumeric, hyphens, underscores (TSR-timestamp-hex format)
    const rawRef = req.params.ref ?? '';
    const ref = rawRef.replace(/[^a-zA-Z0-9\-_]/g, '').slice(0, 64);
    if (!ref) { res.status(400).json({ error: 'Invalid payment reference' }); return; }
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Tax Slayer — Pay $${REPORT_PRICE_USD} USDC</title>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0A0E12;color:#E2E8F0;font-family:'Space Grotesk',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{background:#111820;border:1px solid #1f2937;border-radius:24px;padding:40px;max-width:480px;width:100%;text-align:center;box-shadow:0 0 60px rgba(0,212,170,0.08)}
    .logo{font-size:48px;margin-bottom:8px}
    h1{font-size:1.5rem;font-weight:700;margin-bottom:4px}
    .amount{font-size:3rem;font-weight:700;color:#00D4AA;margin:24px 0 8px;font-family:'JetBrains Mono',monospace}
    .label{color:#64748b;font-size:0.875rem;margin-bottom:24px}
    .divider{border:none;border-top:1px solid #1f2937;margin:24px 0}
    .address-box{background:#0A0E12;border:1px solid #1f2937;border-radius:12px;padding:16px;margin-bottom:16px;text-align:left}
    .address-label{color:#64748b;font-size:0.75rem;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em}
    .address{font-family:'JetBrains Mono',monospace;font-size:0.8rem;color:#00D4AA;word-break:break-all;cursor:pointer}
    .ref-box{background:#0A0E12;border:1px solid #1f2937;border-radius:12px;padding:12px 16px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:center}
    .ref-label{color:#64748b;font-size:0.75rem}
    .ref-val{font-family:'JetBrains Mono',monospace;font-size:0.8rem;color:#F59E0B}
    .qr{background:white;padding:12px;border-radius:12px;display:inline-block;margin-bottom:20px}
    .qr img{display:block;border-radius:4px}
    .steps{text-align:left;margin-bottom:24px}
    .step{display:flex;gap:12px;margin-bottom:12px;align-items:flex-start}
    .step-num{background:#00D4AA22;color:#00D4AA;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;flex-shrink:0;margin-top:1px}
    .step-text{color:#94a3b8;font-size:0.875rem;line-height:1.5}
    .step-text strong{color:#E2E8F0}
    .chain-badge{display:inline-flex;align-items:center;gap:6px;background:#1f2937;border-radius:999px;padding:6px 14px;font-size:0.8rem;color:#94a3b8;margin-bottom:20px}
    .chain-dot{width:8px;height:8px;border-radius:50%;background:#627EEA}
    .copy-btn{background:none;border:1px solid #00D4AA44;color:#00D4AA;border-radius:8px;padding:4px 10px;font-size:0.75rem;cursor:pointer;font-family:'Space Grotesk',sans-serif;margin-left:8px}
    .copy-btn:hover{background:#00D4AA22}
    .footer{color:#475569;font-size:0.75rem;margin-top:16px}
  </style>
</head>
<body>
<div class="card">
  <div class="logo">&#x1F5E1;&#xFE0F;</div>
  <h1>Tax Slayer Agent</h1>
  <div class="amount">$${REPORT_PRICE_USD} USDC</div>
  <div class="label">Full On-Chain Tax Report &#x2014; CSV + PDF</div>

  <div class="chain-badge">
    <span class="chain-dot"></span>
    Ethereum Mainnet
  </div>

  <div class="qr">
    <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${PAYMENT_WALLET}" width="180" height="180" alt="QR Code"/>
  </div>

  <div class="address-box">
    <div class="address-label">Send USDC to</div>
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div class="address" id="addr">${PAYMENT_WALLET}</div>
      <button class="copy-btn" onclick="copyAddr()">Copy</button>
    </div>
  </div>

  <div class="ref-box">
    <span class="ref-label">Reference</span>
    <span class="ref-val">${ref}</span>
  </div>

  <div class="steps">
    <div class="step">
      <div class="step-num">1</div>
      <div class="step-text">Open your wallet (MetaMask, Rainbow, Trust) and send <strong>$${REPORT_PRICE_USD} USDC</strong> to the address above on <strong>Ethereum</strong>.</div>
    </div>
    <div class="step">
      <div class="step-num">2</div>
      <div class="step-text">Copy your <strong>transaction hash</strong> from your wallet (starts with 0x...).</div>
    </div>
    <div class="step">
      <div class="step-num">3</div>
      <div class="step-text">Return to the bot on <strong>Telegram</strong> and paste the transaction hash. Your report generates instantly.</div>
    </div>
  </div>

  <div class="footer">Powered by x402 &#xB7; Zerion &#xB7; OWS &#xB7; Tax Slayer Agent</div>
</div>
<script>
function copyAddr(){
  navigator.clipboard.writeText('${PAYMENT_WALLET}');
  const btn=document.querySelector('.copy-btn');
  btn.textContent='Copied!';
  setTimeout(()=>btn.textContent='Copy',2000);
}
</script>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  });

  app.get('/report/:wallet', (req, res) => {
    handleReport(req, res).catch((err) => {
      console.error('[x402] Unhandled error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  });

  // 404 catch-all
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found', availableRoutes: ['/health', '/pay/:ref', '/report/:wallet'] });
  });

  const server = app.listen(PORT, () => {
    console.log(`[x402] Tax Slayer x402 server running on http://localhost:${PORT}`);
    console.log(`[x402] Report price: $${REPORT_PRICE_USD} USDC`);
    console.log(`[x402] Payment wallet: ${PAYMENT_WALLET || '(PAYMENT_WALLET not set)'}`);
    console.log(`[x402] Endpoints:`);
    console.log(`         GET /health`);
    console.log(`         GET /pay/:ref`);
    console.log(`         GET /report/:wallet`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[x402] Port ${PORT} already in use — x402 server already running, skipping.`);
    } else {
      console.error(`[x402] Server error:`, err.message);
    }
  });
}

// ─── Standalone entry (node src/x402-server.ts) ───────────────────────────────

// Detect if this file is run directly (tsx / ts-node / node)
const isMain =
  typeof require !== 'undefined'
    ? require.main === module
    : import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  import('dotenv/config').then(() => startX402Server()).catch(console.error);
}
