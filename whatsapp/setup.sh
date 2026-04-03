#!/usr/bin/env bash
# ─── Tax Slayer Agent — One-Command Setup ────────────────────────────────────
set -e

echo ""
echo "🚀 Tax Slayer Agent Setup"
echo "=========================="
echo ""

# 1. Bun
if ! command -v bun &>/dev/null; then
  echo "📦 Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
else
  echo "✅ Bun: $(bun --version)"
fi

# 2. OWS CLI
if ! command -v ows &>/dev/null; then
  echo ""
  echo "📦 Installing OWS CLI..."
  curl -fsSL https://docs.openwallet.sh/install.sh | bash
else
  echo "✅ OWS: $(ows --version)"
fi

# 3. Create OWS wallet
WALLET_NAME="${OWS_WALLET_NAME:-tax-slayer-agent}"
echo ""
echo "🔑 Creating OWS wallet: $WALLET_NAME"
ows wallet create --name "$WALLET_NAME" 2>/dev/null || echo "   (wallet already exists — that's fine)"
echo ""
echo "💳 Your agent wallet address:"
ows wallet info --name "$WALLET_NAME" | grep -i address || true

# 4. Install Node deps
echo ""
echo "📦 Installing dependencies..."
bun install

# 5. .env file
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "⚠️  Created .env from .env.example"
  echo "   You MUST fill in:"
  echo "   - ALLIUM_API_KEY  → https://app.allium.so → API Keys"
  echo "   - PAYMENT_WALLET  → your OWS wallet address (shown above)"
  echo "   - MOONPAY_PK      → https://dashboard.moonpay.com (optional)"
else
  echo ""
  echo "✅ .env already exists"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Fill in ALLIUM_API_KEY in .env"
echo "  2. Set PAYMENT_WALLET in .env to your OWS wallet address"
echo "  3. Run: bun start"
echo "  4. Scan QR with WhatsApp → Linked Devices → Link a Device"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
