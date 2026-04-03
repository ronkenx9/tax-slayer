/**
 * Tax Slayer — Conversational Agent
 *
 * Uses Groq (llama-3.3-70b-versatile) for fast, conversational responses.
 * Falls back to rule-based logic if GROQ_API_KEY is not set.
 *
 * Personality: warm, knowledgeable friend — not a tax robot.
 * Like your accountant cousin who texts you back immediately.
 */

import Groq from 'groq-sdk';
import { TAX_KNOWLEDGE_BASE, answerTaxQuestion } from './knowledge.js';

// ─── Client ───────────────────────────────────────────────────────────────────

const client = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

const MODEL = 'llama-3.3-70b-versatile';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MessageTier = 'free' | 'paid' | 'unknown';

export interface AgentResponse {
  text: string;
  tier: MessageTier;
  intent: 'tax_question' | 'report_request' | 'guide_request' | 'guide_topic' | 'greeting' | 'payment_confirm' | 'other';
  walletAddress?: string;
  guideTopic?: string; // e.g. "3" or "staking"
}

// ─── Keyword Sets ─────────────────────────────────────────────────────────────

const TAX_KEYWORDS = [
  'tax', 'taxable', 'capital gain', 'capital loss', 'irs', 'hmrc', 'firs',
  'deduct', 'deductible', 'income', 'form 8949', 'schedule d', 'cost basis',
  'fifo', 'lifo', 'hifo', 'staking', 'yield', 'airdrop', 'nft', 'mining',
  'wash sale', 'loss harvest', 'short term', 'long term', 'crypto tax',
  'how much tax', 'do i owe', 'report', 'declare', 'filing', 'dispose',
  'disposal', 'gain', 'profit', 'fork', 'gift tax', 'donation', 'defi',
  'liquidity pool', 'minting', 'crypto income', 'cost basis', 'tax rate',
];

const REPORT_KEYWORDS = [
  'report', 'generate report', 'full report', 'tax report', 'accountant',
  'pdf', 'export', 'paid report', 'buy report', 'get report',
  'pay', 'purchase report', 'i want a report', 'create report', 'run report',
  'generate my', 'wallet report',
];

const GUIDE_KEYWORDS = [
  'guide', 'menu', 'topics', 'help me', 'what can you', 'list', 'show me',
  'what topics', 'what do you know', 'what can you teach',
];

const GREETING_KEYWORDS = [
  'hello', 'hi', 'hey', 'hiya', 'howdy', 'good morning', 'good afternoon',
  'good evening', 'sup', "what's up", 'start', 'help', 'begin',
];

const PAYMENT_KEYWORDS = [
  'paid', 'i paid', 'i have paid', 'payment sent', 'done payment',
  'sent payment', 'transferred', 'i transferred', 'payment done',
];

export function isTaxQuestion(text: string): boolean {
  const lower = text.toLowerCase();
  return TAX_KEYWORDS.some((kw) => lower.includes(kw));
}

export function isReportRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return REPORT_KEYWORDS.some((kw) => lower.includes(kw));
}

export function isGuideRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return GUIDE_KEYWORDS.some((kw) => lower.includes(kw));
}

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  // Inject a compact version of the knowledge base
  const kbCompact = TAX_KNOWLEDGE_BASE.map((f) => ({
    id: f.id,
    topic: f.topic,
    q: f.question,
    a: f.answer.replace(/\*/g, '').replace(/_/g, '').slice(0, 400) + '...',
    jurisdiction: f.jurisdiction,
  }));

  return `You are TaxSlayer, a conversational AI crypto tax assistant. You're like a knowledgeable friend who happens to know everything about crypto taxes — warm, direct, and genuinely helpful. Not robotic. Not corporate.

PERSONALITY:
- Casual but confident — like texting your accountant cousin
- Concise — this is WhatsApp/Telegram, not an essay. Under 200 words unless they asked for depth.
- Use plain language. Define jargon briefly when you use it.
- 1–2 emojis max per response, only when they add clarity (not decoration)
- Never use markdown headers (# ##) — use *bold* for emphasis in WhatsApp/Telegram
- Reference previous messages naturally: "Like I mentioned..." or "Going back to your question about..."
- When you don't know something, say so — and suggest they consult a CPA for their specific situation

YOUR TWO TIERS:
FREE: Answer any crypto tax question. Educational, no payment needed.
PAID ($10 USDC): Full auto-report — wallet → CSV + PDF with FIFO cost basis. User sends wallet address, you give them a payment link.

YOUR KNOWLEDGE BASE (use as primary source):
${JSON.stringify(kbCompact, null, 2)}

INTENT CLASSIFICATION — respond ONLY with valid JSON (no markdown, no preamble):
{
  "text": "your conversational reply here",
  "tier": "free | paid | unknown",
  "intent": "tax_question | report_request | guide_request | guide_topic | greeting | payment_confirm | other",
  "walletAddress": "0x... or null",
  "guideTopic": "topic number or name if guide_topic intent, else null"
}

RULES:
1. If user sends a wallet address (0x + 40 hex chars), set intent=report_request and extract walletAddress
2. If user asks for the guide/menu/topics list, intent=guide_request
3. If user sends a number (1-14) or topic name from the guide, intent=guide_topic, set guideTopic to that number/name
4. If user says "paid" / "done" / "sent payment", intent=payment_confirm
5. For all tax questions: give a real, helpful answer from your knowledge base
6. Detect jurisdiction from context — if unclear, cover US+UK briefly and note jurisdiction matters
7. Keep jurisdiction disclaimers to one line: "_This applies to [Jurisdiction] — laws vary elsewhere._"
8. NEVER make up tax rules. If unsure, say it and recommend a professional.`;
}

// ─── Wallet Extractor ─────────────────────────────────────────────────────────

function extractWalletAddress(text: string): string | undefined {
  const evmMatch = text.match(/0x[a-fA-F0-9]{40}/);
  if (evmMatch) return evmMatch[0];

  const btcMatch = text.match(/\b(bc1[a-zA-HJ-NP-Z0-9]{25,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/);
  if (btcMatch) return btcMatch[0];

  return undefined;
}

// ─── Rule-Based Fallback ──────────────────────────────────────────────────────

function buildFallbackResponse(userMessage: string, userName?: string): AgentResponse {
  const lower = userMessage.toLowerCase();

  if (GREETING_KEYWORDS.some((kw) => lower.includes(kw))) {
    return {
      text: `Hey${userName ? ` ${userName}` : ''}! 👋 I'm TaxSlayer — your crypto tax assistant. Ask me any tax question free, or say "generate report" to get a full $10 auto-report of your wallet.`,
      tier: 'free',
      intent: 'greeting',
    };
  }

  if (GUIDE_KEYWORDS.some((kw) => lower.includes(kw))) {
    return { text: '', tier: 'free', intent: 'guide_request' };
  }

  if (isReportRequest(lower)) {
    return {
      text: "Sure — to generate your report, send me your wallet address (0x...) and I'll create a payment link for $10 USDC. Once paid, I'll pull your full transaction history and send you a CSV + PDF.",
      tier: 'paid',
      intent: 'report_request',
    };
  }

  if (PAYMENT_KEYWORDS.some((kw) => lower.includes(kw))) {
    return {
      text: "Got it — let me verify your payment and generate your report. One moment! 📊",
      tier: 'paid',
      intent: 'payment_confirm',
    };
  }

  // Try topic number
  const numMatch = lower.match(/^(\d{1,2})$/);
  if (numMatch) {
    return { text: '', tier: 'free', intent: 'guide_topic', guideTopic: numMatch[1] };
  }

  const kbAnswer = answerTaxQuestion(userMessage);
  if (kbAnswer) {
    return { text: kbAnswer, tier: 'free', intent: 'tax_question' };
  }

  return {
    text: "Hmm, not sure I caught that! Try asking a specific crypto tax question (e.g. 'Is staking income taxable?'), type *guide* for a topic menu, or say 'generate report' for a full wallet analysis.",
    tier: 'unknown',
    intent: 'other',
  };
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function processMessage(
  userMessage: string,
  context: {
    history?: Array<{ role: string; content: string }>;
    userName?: string;
  } = {},
): Promise<AgentResponse> {
  const detectedWallet = extractWalletAddress(userMessage);

  // Fast-path: if no Groq key, use rule-based
  if (!client) {
    const response = buildFallbackResponse(userMessage, context.userName);
    if (detectedWallet) response.walletAddress = detectedWallet;
    return response;
  }

  // Build Groq messages
  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: buildSystemPrompt() },
  ];

  // Include history (last 10 turns to keep context window lean)
  if (context.history && context.history.length > 0) {
    const recentHistory = context.history.slice(-10);
    for (const entry of recentHistory) {
      if (entry.role === 'user' || entry.role === 'assistant') {
        messages.push({ role: entry.role as 'user' | 'assistant', content: entry.content });
      }
    }
  }

  messages.push({ role: 'user', content: userMessage });

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 600,
      temperature: 0.4, // focused but not robotic
      messages,
    });

    const raw = completion.choices[0]?.message?.content ?? '';

    // Parse JSON response
    let parsed: Partial<AgentResponse> = {};
    try {
      const cleaned = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // Claude returned non-JSON — extract text and classify
      const fallback = buildFallbackResponse(userMessage, context.userName);
      if (detectedWallet) fallback.walletAddress = detectedWallet;
      // Use the raw text as the reply if it looks like a real answer
      if (raw.length > 20 && !raw.startsWith('{')) {
        fallback.text = raw;
        fallback.intent = 'tax_question';
      }
      return fallback;
    }

    const agentResponse: AgentResponse = {
      text: typeof parsed.text === 'string' ? parsed.text : raw,
      tier: (['free', 'paid', 'unknown'].includes(parsed.tier as string)
        ? parsed.tier
        : 'unknown') as MessageTier,
      intent: (
        ['tax_question', 'report_request', 'guide_request', 'guide_topic', 'greeting', 'payment_confirm', 'other'].includes(
          parsed.intent as string,
        )
          ? parsed.intent
          : 'other'
      ) as AgentResponse['intent'],
    };

    // Wallet: prefer message-extracted over Claude-extracted
    const claudeWallet =
      typeof parsed.walletAddress === 'string' && parsed.walletAddress !== 'null'
        ? parsed.walletAddress
        : undefined;
    const wallet = detectedWallet ?? claudeWallet;
    if (wallet) agentResponse.walletAddress = wallet;

    // Guide topic
    if (parsed.guideTopic) agentResponse.guideTopic = String(parsed.guideTopic);

    return agentResponse;
  } catch (error) {
    console.error('[Agent] Groq API error:', error);
    const fallback = buildFallbackResponse(userMessage, context.userName);
    if (detectedWallet) fallback.walletAddress = detectedWallet;
    return fallback;
  }
}
