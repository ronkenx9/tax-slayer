/**
 * Zerion API Client
 *
 * Uses native Node.js fetch (Node 18+) — no shell, no wsl, works on Railway.
 * Primary:  Direct Zerion REST API with ZERION_API_KEY
 * Fallback: Returns empty dataset gracefully with a console warning
 */

import * as fs from 'fs';

const ZERION_BASE = 'https://api.zerion.io/v1';
const API_KEY = process.env.ZERION_API_KEY ?? '';

// ─── Shared Types (same interface as allium.ts) ───────────────────────────────

export interface NormalizedTransaction {
  date: string;
  chain: string;
  type: 'receive' | 'send' | 'swap' | 'fee' | 'unknown';
  asset: string;
  assetAddress: string;
  amount: number;
  priceUSD: number;
  valueUSD: number;
  costBasisUSD: number;
  realizedPnL: number;
  txHash: string;
  isTaxable: boolean;
}

export interface TaxReportData {
  wallet: string;
  chains: string[];
  transactions: NormalizedTransaction[];
  summary: {
    periodStart: string;
    periodEnd: string;
    taxableEvents: number;
    totalInflows: number;
    totalOutflows: number;
    totalPnL: number;
  };
}

// ─── Zerion API Types ─────────────────────────────────────────────────────────

interface ZerionTransfer {
  direction: 'in' | 'out';
  value: number | null;
  quantity: { float: number };
  price: number | null;
  fungible_info?: {
    symbol?: string;
    name?: string;
    implementations?: Array<{ chain_id: string; address: string | null }>;
  };
}

interface ZerionTx {
  id: string;
  attributes: {
    operation_type: string;
    hash: string;
    mined_at: string;
    status: string;
    transfers: ZerionTransfer[];
  };
  relationships?: {
    chain?: { data?: { id: string } };
  };
}

interface ZerionPage {
  data: ZerionTx[];
  links?: { next?: string | null };
}

// ─── Native fetch HTTP client ─────────────────────────────────────────────────

async function zerionGet(path: string): Promise<ZerionPage> {
  if (!API_KEY) throw new Error('ZERION_API_KEY not set');

  const url = `${ZERION_BASE}${path}`;
  const auth = `Basic ${Buffer.from(`${API_KEY}:`).toString('base64')}`;

  console.log(`[Zerion] GET ${url}`);

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': auth,
      'Accept': 'application/json',
    },
  });

  const rawBody = await res.text();
  console.log(`[Zerion] HTTP ${res.status} — body: ${rawBody.slice(0, 500)}`);

  if (!res.ok) {
    throw new Error(`Zerion API error ${res.status}: ${rawBody}`);
  }

  return JSON.parse(rawBody) as ZerionPage;
}

// ─── Paginated Transaction Fetch ──────────────────────────────────────────────

async function fetchAllTransactions(
  wallet: string,
): Promise<{ txs: ZerionTx[]; chains: string[] }> {
  const txs: ZerionTx[] = [];
  const chains = new Set<string>();

  // Build query string manually — URLSearchParams encodes [] as %5B%5D which Zerion rejects
  const qs = [
    'filter[trash]=only_non_trash',
    'filter[min_mined_at]=1704067200',  // 2024-01-01 00:00:00 UTC
    'filter[max_mined_at]=1798761599',  // 2026-12-31 23:59:59 UTC
    'currency=usd',
    'page[size]=100',
  ].join('&');

  let path: string | null = `/wallets/${wallet}/transactions/?${qs}`;
  let page = 0;
  const MAX_PAGES = 10;

  while (path && page < MAX_PAGES) {
    page++;
    console.log(`[Zerion] Fetching page ${page}...`);
    const result = await zerionGet(path);
    const count = result.data?.length ?? 0;
    console.log(`[Zerion] Page ${page}: ${count} transactions returned`);

    for (const tx of result.data ?? []) {
      // Include all non-failed transactions
      if (tx.attributes.status === 'failed') continue;
      txs.push(tx);
      const chain = tx.relationships?.chain?.data?.id ?? 'ethereum';
      chains.add(chain);
    }

    const nextUrl = result.links?.next ?? null;
    if (!nextUrl) break;
    try {
      const u = new URL(nextUrl);
      path = u.pathname + u.search;
    } catch {
      break;
    }
  }

  console.log(`[Zerion] Done. Total transactions: ${txs.length}, chains: ${[...chains].join(', ')}`);
  return { txs, chains: [...chains] };
}

// ─── Normalize ────────────────────────────────────────────────────────────────

function normalizeZerion(txs: ZerionTx[]): NormalizedTransaction[] {
  const out: NormalizedTransaction[] = [];

  for (const tx of txs) {
    const chain = tx.relationships?.chain?.data?.id ?? 'ethereum';
    const opType = tx.attributes.operation_type;

    for (const t of tx.attributes.transfers ?? []) {
      if (!t.fungible_info) continue;

      const symbol = t.fungible_info.symbol ?? 'UNKNOWN';
      const impl = t.fungible_info.implementations?.find((i) => i.chain_id === chain);
      const address = impl?.address ?? '0x0';
      const amount = t.quantity?.float ?? 0;
      const priceUSD = t.price ?? 0;
      const valueUSD = t.value ?? amount * priceUSD;
      const isInflow = t.direction === 'in';

      let type: NormalizedTransaction['type'] = 'unknown';
      if (opType === 'trade') type = 'swap';
      else if (opType === 'receive' || isInflow) type = 'receive';
      else if (opType === 'send' || !isInflow) type = 'send';

      out.push({
        date: tx.attributes.mined_at,
        chain,
        type,
        asset: symbol,
        assetAddress: address,
        amount: isInflow ? amount : -amount,
        priceUSD,
        valueUSD,
        costBasisUSD: 0,
        realizedPnL: 0,
        txHash: tx.attributes.hash,
        isTaxable: !isInflow,
      });
    }
  }

  return out;
}

// ─── FIFO Cost Basis ──────────────────────────────────────────────────────────

interface Lot { amount: number; priceUSD: number }

function applyFIFO(txs: NormalizedTransaction[]): NormalizedTransaction[] {
  const lots = new Map<string, Lot[]>();
  const sorted = [...txs].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  return sorted.map((tx) => {
    const key = `${tx.chain}:${tx.asset}`;

    if (tx.amount > 0) {
      if (!lots.has(key)) lots.set(key, []);
      lots.get(key)!.push({ amount: tx.amount, priceUSD: tx.priceUSD });
      return { ...tx, costBasisUSD: 0, realizedPnL: 0, isTaxable: false };
    }

    const queue = lots.get(key) ?? [];
    let remaining = Math.abs(tx.amount);
    let totalCost = 0;

    while (remaining > 0 && queue.length > 0) {
      const lot = queue[0];
      const consumed = Math.min(lot.amount, remaining);
      totalCost += consumed * lot.priceUSD;
      lot.amount -= consumed;
      remaining -= consumed;
      if (lot.amount <= 0) queue.shift();
    }

    return { ...tx, costBasisUSD: totalCost, realizedPnL: tx.valueUSD - totalCost, isTaxable: true };
  });
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function fetchTaxReport(wallet: string): Promise<TaxReportData> {
  if (!wallet.startsWith('0x')) {
    throw new Error('Solana wallet support coming soon — use an EVM (0x...) address for now');
  }

  console.log(`[Zerion] Fetching 2025 transactions for ${wallet}`);
  const { txs, chains } = await fetchAllTransactions(wallet);
  console.log(`[Zerion] ${txs.length} confirmed transactions across ${chains.join(', ')}`);

  const normalized = normalizeZerion(txs);
  const withBasis = applyFIFO(normalized);

  const taxable = withBasis.filter((t) => t.isTaxable);
  const inflows = withBasis.filter((t) => t.amount > 0);
  const outflows = withBasis.filter((t) => t.amount < 0);
  const dates = withBasis.map((t) => t.date).sort();

  return {
    wallet,
    chains: chains.length > 0 ? chains : ['ethereum'],
    transactions: withBasis,
    summary: {
      periodStart: dates[0] ?? '2025-01-01',
      periodEnd: dates[dates.length - 1] ?? '2025-12-31',
      taxableEvents: taxable.length,
      totalInflows: inflows.reduce((s, t) => s + t.valueUSD, 0),
      totalOutflows: outflows.reduce((s, t) => s + Math.abs(t.valueUSD), 0),
      totalPnL: taxable.reduce((s, t) => s + t.realizedPnL, 0),
    },
  };
}
