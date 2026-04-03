/**
 * Payment Gate
 *
 * Flow:
 *  1. initiatePayment(userWallet) → PaymentSession with send instructions
 *  2. User sends $10 USDC to PAYMENT_WALLET on-chain
 *  3. User replies with their transaction hash (0x...64chars)
 *  4. verifyTxHash(txHash) → confirms via Zerion API
 *  5. checkPayment(session) → polls recent Zerion transfers as fallback
 *
 * MoonPay CLI (mp) is used by the BOT to pay Zerion x402 data calls ($0.01 each).
 * It is NOT used for user → bot payments. No MoonPay API key required here.
 */

import * as crypto from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PaymentSession {
  ref: string;
  wallet: string;
  amountUSD: number;
  amountUSDC: number;
  paymentUrl: string;       // etherscan link for the receiving address
  paymentAddress: string;   // the actual address to send USDC to
  createdAt: number;
  expiresAt: number;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const REPORT_PRICE_USD  = Number(process.env.REPORT_PRICE_USD ?? '10');
const PAYMENT_WALLET    = process.env.PAYMENT_WALLET ?? '';
const ZERION_API_KEY    = process.env.ZERION_API_KEY ?? '';
const SESSION_TTL_MS    = 30 * 60 * 1000; // 30 min
const PUBLIC_URL        = (process.env.PUBLIC_URL ?? `http://localhost:${process.env.X402_PORT ?? '4402'}`).replace(/\/$/, '');

// USDC on Ethereum mainnet
const USDC_CONTRACT = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

// ─── Zerion helper ────────────────────────────────────────────────────────────

function zerionAuth(): string {
  if (!ZERION_API_KEY) throw new Error('ZERION_API_KEY not set');
  return `Basic ${Buffer.from(`${ZERION_API_KEY}:`).toString('base64')}`;
}

async function zerionGet<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.zerion.io/v1${path}`, {
    headers: { Authorization: zerionAuth(), Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zerion ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ─── Initiate Payment ─────────────────────────────────────────────────────────

export async function initiatePayment(userWallet: string): Promise<PaymentSession> {
  const ref = `TSR-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const now = Date.now();

  // HTML payment page hosted by the x402 server
  const paymentUrl = `${PUBLIC_URL}/pay/${ref}`;

  const session: PaymentSession = {
    ref,
    wallet: userWallet,
    amountUSD: REPORT_PRICE_USD,
    amountUSDC: REPORT_PRICE_USD,
    paymentUrl,
    paymentAddress: PAYMENT_WALLET,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };

  console.log(`[Payment] New session ${ref} for wallet ${userWallet}`);
  return session;
}

// ─── Verify by Transaction Hash (primary method) ──────────────────────────────
// User sends back the tx hash after paying. We check it directly via Zerion.

export async function verifyTxHash(
  txHash: string,
  session: PaymentSession,
): Promise<boolean> {
  if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) return false;
  if (!PAYMENT_WALLET || !ZERION_API_KEY) return false;
  if (Date.now() > session.expiresAt) return false;

  try {
    const data = await zerionGet<{
      data: {
        attributes: {
          status: string;
          transfers: Array<{
            direction: string;
            quantity: { float: number };
            fungible_info?: {
              symbol?: string;
              implementations?: Array<{ address: string | null; chain_id: string }>;
            };
          }>;
        };
      };
    }>(`/transactions/${txHash}?filter[chain_ids]=ethereum`);

    const attrs = data.data?.attributes;
    if (!attrs || attrs.status !== 'confirmed') return false;

    const required = REPORT_PRICE_USD * 0.95; // 5% slippage tolerance

    return (attrs.transfers ?? []).some((t) => {
      if (t.direction !== 'in') return false;
      if (t.fungible_info?.symbol?.toUpperCase() !== 'USDC') return false;

      // Confirm it's Ethereum USDC contract, not a fake token
      const impl = t.fungible_info?.implementations?.find(
        (i) => i.chain_id === 'ethereum',
      );
      if (impl && impl.address?.toLowerCase() !== USDC_CONTRACT) return false;

      return (t.quantity?.float ?? 0) >= required;
    });
  } catch (err) {
    console.error('[Payment] verifyTxHash error:', err);
    return false;
  }
}

// ─── Check Payment (fallback — polls recent Zerion transfers) ─────────────────
// Used when user says "paid" but doesn't provide a tx hash.

export async function checkPayment(session: PaymentSession): Promise<boolean> {
  if (Date.now() > session.expiresAt) {
    throw new Error('Payment session expired. Please start a new request.');
  }
  if (!PAYMENT_WALLET || !ZERION_API_KEY) return false;

  try {
    const data = await zerionGet<{
      data: Array<{
        attributes: {
          mined_at: string;
          transfers: Array<{
            direction: string;
            value: number;
            fungible_info?: { symbol?: string };
          }>;
        };
      }>;
    }>(`/wallets/${PAYMENT_WALLET}/transactions/?filter[asset_types]=fungible&page[size]=50`);

    if (!data.data?.length) return false;

    const since = new Date(session.createdAt).toISOString();
    const required = session.amountUSDC * 0.95;

    return data.data.some((tx) => {
      if (!tx.attributes.mined_at || tx.attributes.mined_at < since) return false;
      return (tx.attributes.transfers ?? []).some(
        (t) =>
          t.direction === 'in' &&
          t.fungible_info?.symbol?.toUpperCase() === 'USDC' &&
          (t.value ?? 0) >= required,
      );
    });
  } catch (err) {
    console.error('[Payment] checkPayment error:', err);
    return false;
  }
}

// ─── Utility: is this string a tx hash? ──────────────────────────────────────

export function extractTxHash(text: string): string | null {
  const match = text.match(/\b(0x[a-fA-F0-9]{64})\b/);
  return match ? match[1] : null;
}
