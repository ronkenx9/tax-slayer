/**
 * Tax Slayer — Knowledge Base
 *
 * Self-contained crypto tax Q&A covering US, UK, Nigeria, EU, Canada, Australia.
 * Used by both the rule-based fallback and injected into the Groq system prompt.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TaxFAQ {
  id: number;
  topic: string;
  question: string;
  answer: string;
  jurisdiction: string;
  keywords: string[];
}

// ─── Guide Topics (numbered menu) ────────────────────────────────────────────

export const GUIDE_TOPICS = [
  { id: 1, label: 'Taxable Events', emoji: '⚡' },
  { id: 2, label: 'Capital Gains & Rates', emoji: '📈' },
  { id: 3, label: 'DeFi — Staking & Yield', emoji: '🌾' },
  { id: 4, label: 'NFTs', emoji: '🖼️' },
  { id: 5, label: 'Airdrops & Forks', emoji: '🪂' },
  { id: 6, label: 'Cost Basis Methods', emoji: '📊' },
  { id: 7, label: 'US Tax Forms & Filing', emoji: '🇺🇸' },
  { id: 8, label: 'UK (HMRC) Rules', emoji: '🇬🇧' },
  { id: 9, label: 'Nigeria (FIRS) Rules', emoji: '🇳🇬' },
  { id: 10, label: 'Record Keeping', emoji: '🗂️' },
  { id: 11, label: 'Wash Sale & Tax Harvesting', emoji: '♻️' },
  { id: 12, label: 'Lost / Stolen / Scams', emoji: '🔒' },
] as const;

// ─── Knowledge Base ───────────────────────────────────────────────────────────

export const TAX_KNOWLEDGE_BASE: TaxFAQ[] = [
  // ── 1. Taxable Events ──────────────────────────────────────────────────────
  {
    id: 1,
    topic: 'Taxable Events',
    question: 'What are crypto taxable events?',
    answer:
      'A taxable event is any action that triggers a tax liability. In crypto:\n\n' +
      '✅ *Taxable:*\n' +
      '• Selling crypto for fiat (USD, GBP, NGN)\n' +
      '• Swapping one crypto for another (ETH → BTC)\n' +
      '• Spending crypto on goods/services\n' +
      '• Receiving staking, yield, mining, or airdrop rewards\n' +
      '• Getting paid in crypto (employment/freelance)\n\n' +
      '❌ *NOT taxable:*\n' +
      '• HODLing (just holding) — no tax until you sell\n' +
      '• Transferring between your own wallets\n' +
      '• Buying crypto with fiat\n' +
      '• Receiving a gift (but the giver may owe gift tax)\n\n' +
      '_Rule: if you get something of value in return, or dispose of crypto — it\'s likely taxable._',
    jurisdiction: 'Global',
    keywords: ['taxable event', 'taxable', 'tax event', 'what triggers', 'sell', 'swap', 'spend', 'hold', 'hodl', 'transfer', 'not taxable'],
  },

  // ── 2. Capital Gains ───────────────────────────────────────────────────────
  {
    id: 2,
    topic: 'Capital Gains & Rates',
    question: 'How do short-term vs long-term crypto capital gains work?',
    answer:
      '📊 *Capital Gain Formula*\n' +
      'Gain = Sale Price − Cost Basis (what you originally paid, including fees)\n\n' +
      '*🇺🇸 US Rates (2025):*\n' +
      '• Short-term (held < 1 year): taxed as ordinary income, 10%–37%\n' +
      '• Long-term (held > 1 year): 0%, 15%, or 20% depending on income\n' +
      '• Net Investment Income Tax may add 3.8% for high earners\n\n' +
      '*🇬🇧 UK Rates (2024/25):*\n' +
      '• Annual exempt amount: £3,000\n' +
      '• Basic rate: 18% | Higher rate: 24%\n\n' +
      '*Strategy:* Holding over 12 months before selling can cut your tax rate significantly.',
    jurisdiction: 'US, UK',
    keywords: ['capital gains', 'short term', 'long term', 'rate', 'tax rate', '37%', '20%', 'calculate gain', 'one year', 'holding period', 'cost basis'],
  },

  // ── 3. DeFi ────────────────────────────────────────────────────────────────
  {
    id: 3,
    topic: 'DeFi — Staking & Yield',
    question: 'How are staking rewards and DeFi yield taxed?',
    answer:
      '🌾 *DeFi Income — General Rule*\n' +
      'Any crypto received as a reward is taxable as *ordinary income* at its fair market value (FMV) when you receive it.\n\n' +
      '*Staking rewards* → Ordinary income on receipt (IRS Rev. Rul. 2023-14 in the US)\n' +
      '*Yield farming / LP fees* → Ordinary income on receipt\n' +
      '*Liquidity pool withdrawals* → Possible taxable event if you get different tokens back\n' +
      '*Lending interest* → Ordinary income\n\n' +
      'When you later *sell* these earned coins, you have a second tax event — capital gain/loss calculated from the FMV at receipt as your new cost basis.\n\n' +
      '_Example: You stake ETH and earn 0.1 ETH when ETH = $3,000. You report $300 income now. When you sell that 0.1 ETH later at $4,000, you report a $100 capital gain._',
    jurisdiction: 'US, UK',
    keywords: ['staking', 'stake', 'yield', 'defi', 'farming', 'lp', 'liquidity pool', 'lending', 'rewards', 'aave', 'compound', 'uniswap', 'protocol'],
  },

  // ── 4. NFTs ────────────────────────────────────────────────────────────────
  {
    id: 4,
    topic: 'NFTs',
    question: 'How are NFTs taxed?',
    answer:
      '🖼️ *NFT Tax Rules (US):*\n\n' +
      '• *Buying an NFT* with ETH: the swap from ETH → NFT is a taxable disposal of ETH. You owe tax on any gain in ETH since you bought it.\n' +
      '• *Selling an NFT*: Capital gain/loss (short or long-term based on hold time).\n' +
      '• *Minting an NFT as creator*: Not taxable until sold. When sold, proceeds = ordinary income (self-employment).\n' +
      '• *Swapping one NFT for another*: Taxable disposal — you owe on the gain.\n' +
      '• *Collectible NFTs*: May face a higher 28% collectible rate in the US (still being debated).\n\n' +
      '*Practical tip*: Track the ETH price at the time of every NFT buy/sell — that\'s your cost basis and proceeds for each event.',
    jurisdiction: 'US',
    keywords: ['nft', 'nfts', 'non fungible', 'mint', 'opensea', 'digital art', 'collectible', 'buy nft', 'sell nft', 'nft tax'],
  },

  // ── 5. Airdrops & Forks ────────────────────────────────────────────────────
  {
    id: 5,
    topic: 'Airdrops & Forks',
    question: 'Are airdrops and hard forks taxable?',
    answer:
      '🪂 *Airdrops:*\n' +
      'Taxable as ordinary income at FMV on the date you receive/claim them. Your cost basis for future sales = that FMV.\n\n' +
      '*Common airdrop situations:*\n' +
      '• Retroactive protocol airdrops (Uniswap UNI, Arbitrum ARB): income on claim date\n' +
      '• NFT airdrops: income at FMV on receipt\n' +
      '• Dust airdrops worth $0: effectively $0 income, but track them\n\n' +
      '⛓️ *Hard Forks:*\n' +
      'IRS Rev. Rul. 2019-24: forked tokens you receive are taxable ordinary income at FMV when you have control (can spend them). Example: Bitcoin Cash when it forked from BTC in 2017.\n\n' +
      '_Key: if you didn\'t receive new tokens (soft fork, network upgrade), no income event._',
    jurisdiction: 'US, UK',
    keywords: ['airdrop', 'airdrops', 'hard fork', 'fork', 'free tokens', 'claim', 'retroactive', 'drop', 'uniswap uni', 'arb'],
  },

  // ── 6. Cost Basis Methods ──────────────────────────────────────────────────
  {
    id: 6,
    topic: 'Cost Basis Methods',
    question: 'What cost basis methods can I use?',
    answer:
      '📊 *Cost Basis Methods:*\n\n' +
      '• *FIFO* (First In, First Out): oldest coins sold first. US default if you don\'t specify.\n' +
      '• *LIFO* (Last In, First Out): newest coins sold first. Can reduce gains in a bull market.\n' +
      '• *HIFO* (Highest In, First Out): highest-cost coins sold first. Minimises gains overall — popular for tax harvesting.\n' +
      '• *Specific Identification*: you choose exactly which lot to sell. Most flexible but requires per-lot records.\n\n' +
      '🇬🇧 *UK Exception*: HMRC uses Section 104 pooling (average cost) — you cannot choose FIFO/HIFO.\n\n' +
      '_Tax Slayer generates your report using FIFO by default. The CSV includes all lot data so your CPA can recalculate with any method._',
    jurisdiction: 'Global',
    keywords: ['cost basis', 'fifo', 'lifo', 'hifo', 'method', 'accounting method', 'specific identification', 'lot', 'basis method'],
  },

  // ── 7. US Tax Forms ────────────────────────────────────────────────────────
  {
    id: 7,
    topic: 'US Tax Forms & Filing',
    question: 'What forms do I need to file crypto taxes in the US?',
    answer:
      '🇺🇸 *US Crypto Tax Filing Checklist:*\n\n' +
      '📋 *Form 8949*: Report every crypto sale/disposal with:\n' +
      '  - Date acquired & date sold\n' +
      '  - Proceeds (what you received)\n' +
      '  - Cost basis (what you paid)\n' +
      '  - Gain or loss\n\n' +
      '📋 *Schedule D*: Summarises Form 8949 totals (short-term + long-term)\n\n' +
      '📋 *Schedule 1 or C*: Report crypto income — staking, mining, airdrops, crypto salary\n\n' +
      '📋 *FBAR / Form 8938*: If you hold >$10k (or >$50k for Form 8938) on foreign exchanges — yes, Binance counts\n\n' +
      '⚠️ *The "digital assets" question*: The 1040 now asks "did you receive, sell, or trade digital assets?" — answer truthfully.\n\n' +
      '_Tax Slayer\'s CSV export is formatted for direct import into TurboTax, TaxAct, Koinly, and CoinTracker._',
    jurisdiction: 'US',
    keywords: ['form 8949', 'schedule d', 'irs', 'us tax', 'file taxes', 'filing', '1040', 'turbotax', 'cointracker', 'koinly', 'fbar'],
  },

  // ── 8. UK (HMRC) ───────────────────────────────────────────────────────────
  {
    id: 8,
    topic: 'UK (HMRC) Rules',
    question: 'How is crypto taxed in the UK?',
    answer:
      '🇬🇧 *UK Crypto Tax (HMRC):*\n\n' +
      '• Crypto is property — disposals trigger Capital Gains Tax (CGT)\n' +
      '• Annual Exempt Amount 2024/25: *£3,000* (was £6,000 in 2023/24)\n' +
      '• CGT rates: *18%* (basic rate) | *24%* (higher rate) on crypto gains\n' +
      '• Crypto income (staking, mining, airdrops): subject to *Income Tax*\n\n' +
      '📊 *Cost basis*: Section 104 pool — average cost, NOT FIFO/HIFO\n' +
      '📅 *Same-day rule*: Sell and rebuy the same crypto same day → use that day\'s price\n' +
      '📅 *30-day rule*: Sell and rebuy within 30 days → use rebuy price as cost basis (blocks loss harvesting)\n\n' +
      '📋 *Reporting*: Self Assessment tax return — report if gains > annual exempt amount OR proceeds > £50,000\n\n' +
      '_HMRC is increasingly using exchange data requests to find crypto holders who haven\'t reported._',
    jurisdiction: 'UK',
    keywords: ['uk', 'hmrc', 'united kingdom', 'british', 'cgt', 'capital gains tax', 'section 104', '30 day rule', 'self assessment', 'england', '£3000'],
  },

  // ── 9. Nigeria (FIRS) ──────────────────────────────────────────────────────
  {
    id: 9,
    topic: 'Nigeria (FIRS) Rules',
    question: 'How is crypto taxed in Nigeria?',
    answer:
      '🇳🇬 *Nigeria Crypto Tax (FIRS):*\n\n' +
      '• The Finance Act 2023 introduced a *10% Capital Gains Tax* on crypto and digital asset disposals\n' +
      '• Crypto-to-crypto swaps are taxable disposals\n' +
      '• Business income from crypto trading is subject to *Companies Income Tax (CIT)* or *Personal Income Tax (PIT)*\n' +
      '• Staking/mining rewards: likely treated as income under existing tax law\n\n' +
      '⚠️ *Regulatory backdrop*: The CBN banned banks from facilitating crypto (2021) then partially reversed. Binance Nigeria was shut down (2024). Regulations are evolving rapidly.\n\n' +
      '📋 *Reporting*: Annual self-assessment return with FIRS. Maintain detailed records of all transactions in Naira equivalent at time of trade.\n\n' +
      '💡 *Practical advice*: Use a local tax professional familiar with FIRS digital asset guidance — the framework is still developing.',
    jurisdiction: 'Nigeria',
    keywords: ['nigeria', 'nigerian', 'firs', 'naira', 'lagos', 'abuja', 'cbn', 'finance act', 'ng', 'africa'],
  },

  // ── 10. Record Keeping ─────────────────────────────────────────────────────
  {
    id: 10,
    topic: 'Record Keeping',
    question: 'What records do I need to keep for crypto taxes?',
    answer:
      '🗂️ *What to Keep for Every Transaction:*\n\n' +
      '• Date and time (UTC)\n' +
      '• Amount of crypto sent/received\n' +
      '• USD (or local fiat) value at the time\n' +
      '• Transaction hash (on-chain proof)\n' +
      '• The other party\'s address (if known)\n' +
      '• Platform/exchange used\n' +
      '• Purpose (trade, income, gift, staking, etc.)\n\n' +
      '⏰ *How long to keep records:*\n' +
      '  - US: 3 years minimum, 6+ years if underreporting is possible\n' +
      '  - UK: 5+ years after 31 Jan filing deadline\n' +
      '  - Nigeria: 6 years\n\n' +
      '💡 *Pro tips:*\n' +
      '• Export CSVs from every exchange at year-end\n' +
      '• Screenshot wallet balances on Dec 31\n' +
      '• Save all DeFi transaction receipts\n\n' +
      '_Tax Slayer pulls all this from the blockchain automatically — your report IS your records._',
    jurisdiction: 'Global',
    keywords: ['records', 'record keeping', 'documentation', 'transaction history', 'csv', 'log', 'proof', 'how long', 'keep records'],
  },

  // ── 11. Wash Sale ──────────────────────────────────────────────────────────
  {
    id: 11,
    topic: 'Wash Sale & Tax Harvesting',
    question: 'Can I harvest crypto losses without the wash sale rule?',
    answer:
      '♻️ *Tax Loss Harvesting with Crypto (US):*\n\n' +
      'The *wash sale rule* (which makes a loss non-deductible if you rebuy the same asset within 30 days) does NOT currently apply to cryptocurrency in the US.\n\n' +
      '✅ This means you can:\n' +
      '  - Sell ETH at a loss\n' +
      '  - Buy ETH back 1 minute later\n' +
      '  - Still claim the loss on your taxes\n\n' +
      '⚠️ *Caution:* Legislation to extend wash sale rules to crypto has been proposed in Congress. This could change. Monitor IRS updates.\n\n' +
      '🇬🇧 *UK:* The 30-day rule DOES apply — sell and rebuy within 30 days and you cannot use the loss.\n\n' +
      '*Strategy*: Harvest losses before Dec 31 (US tax year end) to offset gains realised earlier in the year.',
    jurisdiction: 'US, UK',
    keywords: ['wash sale', 'tax loss harvest', 'harvest', 'loss', 'claim loss', 'loss harvesting', 'sell buy back', '30 days'],
  },

  // ── 12. Lost / Stolen ──────────────────────────────────────────────────────
  {
    id: 12,
    topic: 'Lost / Stolen / Scams',
    question: 'Can I deduct lost or stolen crypto?',
    answer:
      '🔒 *Lost/Stolen Crypto — Tax Treatment:*\n\n' +
      '🇺🇸 *US (tough situation):*\n' +
      '  - Personal theft losses are generally NOT deductible under TCJA 2018-2025\n' +
      '  - Exception: loss from a federally declared disaster zone\n' +
      '  - Exchange/protocol collapses (FTX, Celsius): may qualify as bad debt losses (Form 8949 or ordinary loss) — consult a CPA\n' +
      '  - Rug pulls: treated similarly; hard to deduct without proper documentation\n\n' +
      '🇬🇧 *UK:*\n' +
      '  - Lost/stolen crypto where you have no practical possibility of recovery may qualify as a negligible value claim\n' +
      '  - Creates a capital loss at the time the claim is made\n\n' +
      '*Always document:*\n' +
      '  - When it was lost/stolen\n' +
      '  - Value at time of loss\n' +
      '  - Police report or on-chain evidence\n' +
      '  - Exchange or protocol communications',
    jurisdiction: 'US, UK',
    keywords: ['lost', 'stolen', 'theft', 'hack', 'hacked', 'deduct', 'rug pull', 'scam', 'ftx', 'celsius', 'bankrupt', 'exchange collapse'],
  },

  // ── Gifts & Donations ──────────────────────────────────────────────────────
  {
    id: 13,
    topic: 'Gifts & Donations',
    question: 'Are crypto gifts and donations taxable?',
    answer:
      '🎁 *Gifts (US):*\n' +
      '• Giving crypto: NOT taxable to the giver up to $18,000/recipient in 2024 (annual exclusion). Above that, file Form 709.\n' +
      '• Receiving a gift: NOT taxable income. You inherit the giver\'s cost basis + their holding period.\n\n' +
      '🏛️ *Charitable Donations (US):*\n' +
      '• Donating appreciated crypto directly to a 501(c)(3): deduct the FMV + skip capital gains on the appreciation. This is better than selling then donating.\n' +
      '• Requires Form 8283 for donations > $500.\n\n' +
      '🇬🇧 *UK Gifts:*\n' +
      '• Gifts between spouses: no CGT.\n' +
      '• Gifts to others: treated as disposal at market value. You pay CGT on gain.\n\n' +
      '_Tax Slayer\'s report flags likely gift transactions but can\'t confirm intent — verify with your records._',
    jurisdiction: 'US, UK',
    keywords: ['gift', 'donate', 'donation', 'charity', 'give', 'inherit', 'basis gift', 'form 709', '501c3'],
  },

  // ── Mining ─────────────────────────────────────────────────────────────────
  {
    id: 14,
    topic: 'Mining',
    question: 'Is crypto mining income taxable?',
    answer:
      '⛏️ *Mining Income:*\n\n' +
      '• Mined coins are taxable as *ordinary income* at FMV on the day you receive them\n' +
      '• That FMV becomes your cost basis for when you later sell\n\n' +
      '*If you mine as a business:*\n' +
      '• Deduct electricity (major!), hardware depreciation, hosting, cooling\n' +
      '• Report on Schedule C (US) or Self Assessment (UK)\n\n' +
      '*If you mine as a hobby:*\n' +
      '• Still taxable income, but fewer deductions allowed\n' +
      '• Subject to the IRS hobby loss rules (Section 183)\n\n' +
      '_The IRS/HMRC distinction between "business" and "hobby" mining matters a lot. If you\'re serious, set up an LLC and track all expenses._',
    jurisdiction: 'US, UK',
    keywords: ['mining', 'miner', 'mine', 'proof of work', 'gpu', 'rig', 'electricity', 'hardware', 'bitcoin mining'],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the numbered self-help guide menu.
 */
export function getTaxGuideMenu(): string {
  const lines = [
    '📖 *Tax Slayer — Crypto Tax Self-Help Guide*',
    '',
    'Pick a topic by numbering your reply (e.g. "1" or "topic 3"):',
    '',
    ...GUIDE_TOPICS.map((t) => `${t.emoji} *${t.id}.* ${t.label}`),
    '',
    '_All topics are free. For a full auto-report of your wallet, type /report (Telegram) or "generate report" (WhatsApp)._',
  ];
  return lines.join('\n');
}

/**
 * Returns a deep-dive answer for a specific guide topic.
 * Accepts topic ID (number) or partial topic name.
 */
export function getTaxGuide(topicRef: string): string | null {
  const trimmed = topicRef.trim().toLowerCase();

  // Try numeric ID
  const numericId = parseInt(trimmed, 10);
  if (!isNaN(numericId)) {
    const faq = TAX_KNOWLEDGE_BASE.find((f) => f.id === numericId);
    if (faq) return formatFAQ(faq);
  }

  // Try topic name match
  const byTopic = TAX_KNOWLEDGE_BASE.find((f) =>
    f.topic.toLowerCase().includes(trimmed) ||
    trimmed.includes(f.topic.toLowerCase()),
  );
  if (byTopic) return formatFAQ(byTopic);

  return null;
}

function formatFAQ(faq: TaxFAQ): string {
  return `${faq.answer}\n\n_📍 Jurisdiction: ${faq.jurisdiction}_`;
}

/**
 * Keyword-based lookup — returns best-matching answer or null.
 */
export function answerTaxQuestion(question: string): string | null {
  const q = question.toLowerCase();

  const scored = TAX_KNOWLEDGE_BASE.map((faq) => {
    const hits = faq.keywords.filter((kw) => q.includes(kw.toLowerCase())).length;
    return { faq, hits };
  }).filter(({ hits }) => hits > 0);

  if (scored.length === 0) return null;

  scored.sort((a, b) => b.hits - a.hits);
  return formatFAQ(scored[0].faq);
}

/**
 * Returns the welcome message shown to new users.
 */
export function getFreeTierWelcome(): string {
  return (
    "👋 Hey! I'm *Tax Slayer* — your AI crypto tax assistant, built on the Open Wallet Standard.\\n\\n" +
    '🎟️ *OWS Hackathon Demo — Free Sponsored Report:*\\n' +
    'Judges can get a full on-chain tax report for free, sponsored by OWS.\\n' +
    '➡️ Just type /demo to activate\\n\\n' +
    '─────────────────────\\n\\n' +
    '🆓 *Free — Ask me anything:*\\n' +
    '• "Are staking rewards taxable?"\\n' +
    '• "What\'s the wash sale rule for crypto?"\\n' +
    '• "How does Nigeria tax crypto?"\\n' +
    '• Type /guide for the full self-help menu 📖\\n\\n' +
    '💰 *Regular Plan ($10 USDC) — Auto tax report:*\\n' +
    '• Full wallet transaction history\\n' +
    '• FIFO cost basis calculated automatically\\n' +
    '• Accountant-ready CSV + PDF\\n' +
    '• Type /report to start\\n\\n' +
    'What do you need help with? 🚀'
  );
}

