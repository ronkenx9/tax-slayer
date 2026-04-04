/**
 * Report Generator
 * Produces accountant-ready CSV + PDF from normalized transaction data.
 */

import { createObjectCsvWriter } from 'csv-writer';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import type { TaxReportData, NormalizedTransaction } from './zerion.js';

const REPORTS_DIR = './reports';

// ─── CSV ──────────────────────────────────────────────────────────────────────

async function generateCSV(wallet: string, data: TaxReportData): Promise<string> {
  const slug = wallet.slice(0, 8);
  const filePath = path.join(REPORTS_DIR, `tax-report-${slug}-${Date.now()}.csv`);

  const writer = createObjectCsvWriter({
    path: filePath,
    header: [
      { id: 'date', title: 'Date (UTC)' },
      { id: 'chain', title: 'Chain' },
      { id: 'type', title: 'Type' },
      { id: 'asset', title: 'Asset' },
      { id: 'amount', title: 'Amount' },
      { id: 'priceUSD', title: 'Price (USD)' },
      { id: 'valueUSD', title: 'Value (USD)' },
      { id: 'costBasisUSD', title: 'Cost Basis (USD)' },
      { id: 'realizedPnL', title: 'Realized PnL (USD)' },
      { id: 'isTaxable', title: 'Taxable?' },
      { id: 'txHash', title: 'Tx Hash' },
    ],
  });

  const records = data.transactions.map((tx: NormalizedTransaction) => ({
    date: formatDate(tx.date),
    chain: tx.chain,
    type: tx.type,
    asset: tx.asset,
    amount: tx.amount.toFixed(8),
    priceUSD: tx.priceUSD.toFixed(4),
    valueUSD: tx.valueUSD.toFixed(2),
    costBasisUSD: tx.costBasisUSD.toFixed(2),
    realizedPnL: tx.realizedPnL.toFixed(2),
    isTaxable: tx.isTaxable ? 'Yes' : 'No',
    txHash: tx.txHash,
  }));

  await writer.writeRecords(records);
  return filePath;
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

/**
 * Strips characters outside WinAnsi (Latin-1 supplement) range so pdf-lib
 * standard fonts don't throw "WinAnsi cannot encode X" errors.
 * Emoji, CJK, and other Unicode in token symbols are replaced with '?'.
 */
function safeText(str: string): string {
  return str.replace(/[^\x00-\xFF]/g, '?');
}

async function generatePDF(wallet: string, data: TaxReportData): Promise<string> {
  const slug = wallet.slice(0, 8);
  const filePath = path.join(REPORTS_DIR, `tax-summary-${slug}-${Date.now()}.pdf`);

  const doc = await PDFDocument.create();
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);

  const page = doc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();

  const margin = 50;

  let y = height - 60;

  // ── Header ────────────────────────────────────────────────────────────────
  page.drawRectangle({
    x: 0,
    y: height - 80,
    width,
    height: 80,
    color: rgb(0.04, 0.04, 0.16), // dark navy
  });

  page.drawText('TAX SLAYER', {
    x: margin,
    y: height - 45,
    size: 22,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  page.drawText('Crypto Tax Report 2025', {
    x: margin,
    y: height - 65,
    size: 11,
    font: regularFont,
    color: rgb(0.7, 0.7, 0.9),
  });

  y = height - 105;

  // ── Wallet Info ───────────────────────────────────────────────────────────
  drawSectionHeader(page, boldFont, 'Wallet Details', margin, y);
  y -= 20;

  const shortWallet = `${wallet.slice(0, 10)}...${wallet.slice(-8)}`;
  drawKV(page, regularFont, boldFont, 'Address', shortWallet, margin, y);
  y -= 16;
  drawKV(page, regularFont, boldFont, 'Chains', data.chains.join(', '), margin, y);
  y -= 16;
  drawKV(page, regularFont, boldFont, 'Period', `${formatDate(data.summary.periodStart)} to ${formatDate(data.summary.periodEnd)}`, margin, y);
  y -= 30;

  // ── Summary Table ─────────────────────────────────────────────────────────
  drawSectionHeader(page, boldFont, 'Summary', margin, y);
  y -= 20;

  const summaryRows = [
    ['Total Transactions', String(data.transactions.length)],
    ['Taxable Events', String(data.summary.taxableEvents)],
    ['Total Inflows', `$${data.summary.totalInflows.toFixed(2)}`],
    ['Total Outflows', `$${data.summary.totalOutflows.toFixed(2)}`],
    ['Realized PnL', formatPnL(data.summary.totalPnL)],
  ];

  for (const [label, value] of summaryRows) {
    const isGain = value.startsWith('+');
    const isLoss = value.startsWith('-$') || (value.startsWith('$') && label === 'Total Outflows');
    drawKV(
      page, regularFont, boldFont, label, value, margin, y,
      isGain ? rgb(0.1, 0.6, 0.2) : isLoss && label === 'Realized PnL' ? rgb(0.8, 0.1, 0.1) : undefined,
    );
    y -= 16;
  }

  y -= 20;

  // ── Top Taxable Events ────────────────────────────────────────────────────
  drawSectionHeader(page, boldFont, 'Top Taxable Events', margin, y);
  y -= 20;

  const topTaxable = data.transactions
    .filter((t) => t.isTaxable)
    .sort((a, b) => Math.abs(b.realizedPnL) - Math.abs(a.realizedPnL))
    .slice(0, 10);

  if (topTaxable.length === 0) {
    page.drawText('No taxable events found.', { x: margin, y, size: 10, font: regularFont, color: rgb(0.5, 0.5, 0.5) });
    y -= 16;
  } else {
    // Table header
    drawTableRow(page, boldFont, ['Date', 'Asset', 'Amount', 'Value (USD)', 'PnL (USD)'], margin, y, true);
    y -= 14;

    for (const tx of topTaxable) {
      drawTableRow(page, regularFont, [
        formatDate(tx.date).slice(0, 10),
        safeText(tx.asset),           // token symbols can contain Unicode
        tx.amount.toFixed(4),
        `$${tx.valueUSD.toFixed(2)}`,
        formatPnL(tx.realizedPnL),
      ], margin, y, false);
      y -= 14;
      if (y < 100) break; // prevent overflow
    }
  }

  y -= 20;

  // ── Footer ────────────────────────────────────────────────────────────────
  page.drawLine({
    start: { x: margin, y: y },
    end: { x: width - margin, y: y },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
  y -= 14;

  page.drawText(
    `Generated by Tax Slayer Agent via Zerion + OWS + x402  |  ${new Date().toISOString().slice(0, 10)}`,
    { x: margin, y, size: 8, font: regularFont, color: rgb(0.6, 0.6, 0.6) },
  );

  page.drawText('This report is for informational purposes only. Consult a tax professional.', {
    x: margin,
    y: y - 12,
    size: 7,
    font: regularFont,
    color: rgb(0.7, 0.7, 0.7),
  });

  const pdfBytes = await doc.save();
  fs.writeFileSync(filePath, pdfBytes);
  return filePath;
}

// ─── PDF Helpers ──────────────────────────────────────────────────────────────

function drawSectionHeader(
  page: ReturnType<PDFDocument['addPage']>,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  title: string,
  x: number,
  y: number,
) {
  page.drawRectangle({ x: x - 4, y: y - 4, width: 180, height: 18, color: rgb(0.94, 0.94, 1) });
  page.drawText(title.toUpperCase(), { x, y, size: 10, font, color: rgb(0.1, 0.1, 0.5) });
}

function drawKV(
  page: ReturnType<PDFDocument['addPage']>,
  labelFont: Awaited<ReturnType<PDFDocument['embedFont']>>,
  valueFont: Awaited<ReturnType<PDFDocument['embedFont']>>,
  label: string,
  value: string,
  x: number,
  y: number,
  valueColor?: ReturnType<typeof rgb>,
) {
  page.drawText(`${label}:`, { x, y, size: 10, font: labelFont, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(value, { x: x + 140, y, size: 10, font: valueFont, color: valueColor ?? rgb(0.1, 0.1, 0.1) });
}

function drawTableRow(
  page: ReturnType<PDFDocument['addPage']>,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  cells: string[],
  x: number,
  y: number,
  isHeader: boolean,
) {
  const colWidths = [70, 50, 65, 75, 75];
  const color = isHeader ? rgb(0.2, 0.2, 0.6) : rgb(0.15, 0.15, 0.15);
  let cx = x;
  for (let i = 0; i < cells.length; i++) {
    page.drawText(cells[i], { x: cx, y, size: isHeader ? 9 : 8.5, font, color });
    cx += colWidths[i];
  }
}

function formatPnL(pnl: number): string {
  if (pnl >= 0) return `+$${pnl.toFixed(2)}`;
  return `-$${Math.abs(pnl).toFixed(2)}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  } catch {
    return iso;
  }
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function generateReports(
  wallet: string,
  data: TaxReportData,
): Promise<{ csv: string; pdf: string }> {
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const [csv, pdf] = await Promise.all([
    generateCSV(wallet, data),
    generatePDF(wallet, data),
  ]);

  return { csv, pdf };
}
