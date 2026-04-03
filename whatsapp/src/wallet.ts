/**
 * OWS Wallet Wrapper
 * Wraps the OWS CLI for wallet identity and credential management.
 *
 * Install OWS: curl -fsSL https://docs.openwallet.sh/install.sh | bash
 * Then: ows wallet create --name tax-slayer-agent
 */

import { execSync, spawnSync } from 'child_process';

const WALLET_NAME = process.env.OWS_WALLET_NAME ?? 'tax-slayer-agent';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WalletInfo {
  name: string;
  address: string;
  balance: number;
  currency: string;
}

// ─── OWS CLI Wrapper ──────────────────────────────────────────────────────────

function runOWS(args: string[]): { stdout: string; stderr: string; ok: boolean } {
  const result = spawnSync('ows', args, { encoding: 'utf8', timeout: 15_000 });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    ok: result.status === 0,
  };
}

export function isOWSInstalled(): boolean {
  const result = runOWS(['--version']);
  return result.ok;
}

export function getWalletInfo(): WalletInfo | null {
  const result = runOWS(['wallet', 'info', '--name', WALLET_NAME, '--json']);
  if (!result.ok) return null;
  try {
    return JSON.parse(result.stdout) as WalletInfo;
  } catch {
    return null;
  }
}

export function getWalletBalance(): number {
  const info = getWalletInfo();
  return info?.balance ?? 0;
}

export function getWalletAddress(): string | null {
  const info = getWalletInfo();
  return info?.address ?? null;
}

export function signMessage(message: string): string | null {
  const result = runOWS(['wallet', 'sign', '--name', WALLET_NAME, '--message', message]);
  if (!result.ok) return null;
  return result.stdout.trim();
}

// ─── Setup Check ──────────────────────────────────────────────────────────────
// Called at startup to verify OWS is ready. Non-fatal — bot works without it
// for basic payment flows, but OWS enables richer identity features.

export function checkOWSSetup(): { installed: boolean; walletReady: boolean; address: string | null } {
  const installed = isOWSInstalled();
  if (!installed) {
    return { installed: false, walletReady: false, address: null };
  }

  const info = getWalletInfo();
  return {
    installed: true,
    walletReady: info !== null,
    address: info?.address ?? null,
  };
}

// ─── Setup Instructions ───────────────────────────────────────────────────────

export const OWS_SETUP_INSTRUCTIONS = `
OWS CLI Setup:
1. curl -fsSL https://docs.openwallet.sh/install.sh | bash
2. ows wallet create --name ${WALLET_NAME}
3. ows wallet info --name ${WALLET_NAME}  (copy the address into .env PAYMENT_WALLET)
`.trim();
