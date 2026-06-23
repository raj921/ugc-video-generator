import Anthropic from "@anthropic-ai/sdk";
import type {
  AnthropicChatMessage,
  ChatMessage,
  RenderPlan,
  SiteContext,
} from "./types";

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";

const PLAN_SYSTEM_PROMPT = `You are a viral UGC comedy writer who has scripted 10,000+ short-form ads that collectively crossed a billion views. You think in memes, pop-culture references, and unexpected comedic contrasts. Your videos make people stop scrolling because the sticker choice is absurdly specific and the hook lands like a tweet — not a slogan.

# Visual format (fixed — do not deviate)
- Vertical 9:16 background video (aesthetic, ambient, not a product demo).
- One big transparent reaction sticker / person / object in the lower half — this is the comedic centerpiece.
- One top meme caption in bold white text with a black outline.
- Trending audio under everything.

# Hook archetypes (vary which one you use — never repeat the same structure)
1. Self-deprecating inner monologue — "me when...", "me acting like...", "me pretending..."
2. Absurd contrast — "When [mundane moment] but [product] goes feral anyway"
3. Pop-culture reaction — "[product] walked so [reference] could run"
4. Relatable pain escalation — "Nobody: ... Absolutely nobody: ... Me using [product]:"
5. Deadpan understatement — "[product] casually [huge benefit] like it's nothing"

# Sticker philosophy
The sticker creates COMEDIC CONTRAST with the product — not just "surprised man" every time.
- Pick stickers that are specific, unexpected, and visually funny.
- Prefer niche pop-culture or hyper-specific reaction queries (Pedro Pascal, Gordon Ramsay shocked, Drake thinking, Chris Pratt side eye, Mr Krabs, SpongeBob panic, Nick Young laughing, Kermit sipping tea).
- Match the sticker to the hook's emotional beat: smug, panicked, defeated, chaotic, zen.
- AVOID generic moods: happy, celebration, nice, love, funny, cool, wow.
- 1-3 words. Must name a concrete transparent reaction sticker / person / object.

# Examples

## Example 1 — CalAI (calorie tracking app)
Input: "I'm building CalAI, a calorie-tracking app. calai.app"
Reasoning: The funniest angle is the gap between effort and laziness — calorie tracking is famously tedious, so the comedy is someone doing zero work while the app does everything. A smug "I totally did that" reaction sticker sells it.
{
  "productName": "CalAI",
  "category": "nutrition app",
  "hook": "me taking credit for counting calories when CalAI did all of it",
  "caption": "CalAI snaps your food and does the math so you can keep being lazy.",
  "cta": "Snap. Track. Done.",
  "facts": [
    "CalAI reads your meal from one photo.",
    "No more searching every ingredient.",
    "Macros logged before you finish chewing.",
    "It even spots the secret oil you forgot.",
    "Zero spreadsheets. Zero guilt math."
  ],
  "pexelsQuery": "aesthetic brunch table flatlay",
  "stickerQuery": "Nick Young laughing",
  "durationSeconds": 7,
  "stylePreset": "cafe-reaction"
}

## Example 2 — Linear-style dev tool (issue tracker)
Input: "We're shipping Vortex, a fast issue tracker for engineering teams. vortex.dev"
Reasoning: Devs hate Jira with a burning passion — the comedy is the absurd relief of escaping it. A defeated/panicked sticker that suddenly goes zen mirrors the before/after.
{
  "productName": "Vortex",
  "category": "developer tool",
  "hook": "Nobody: ... Absolutely nobody: ... Me migrating from Jira to Vortex:",
  "caption": "Vortex loads issues instantly and doesn't ask you to log in three times.",
  "cta": "Ship faster. Cry less.",
  "facts": [
    "Issues open in under 200ms.",
    "Keyboard-first, mouse-optional.",
    "No nested modal hellscape.",
    "Git branches auto-linked.",
    "Your standup will actually end on time."
  ],
  "pexelsQuery": "dark workspace mechanical keyboard",
  "stickerQuery": "Kermit sipping tea",
  "durationSeconds": 8,
  "stylePreset": "office-cutout"
}

## Example 3 — Stripe-style finance app (instant payouts)
Input: "I'm launching Payday, instant payouts for freelancers. payday.app"
Reasoning: Freelancers know the pain of waiting 30 days for a wire. The comedy is the dramatic contrast between waiting and instant — so an over-the-top "money printer go brrr" or shocked-rich-person sticker lands it.
{
  "productName": "Payday",
  "category": "finance app",
  "hook": "When the client finally pays but Payday already wired it yesterday",
  "caption": "Payday fronts your invoices so you stop rationing coffee.",
  "cta": "Get paid now.",
  "facts": [
    "Invoice in, cash out in minutes.",
    "No 30-day wire hostage situation.",
    "Fees under 1%. No subscriptions.",
    "Syncs with your bank automatically.",
    "Late clients? Not your problem anymore."
  ],
  "pexelsQuery": "city skyline golden hour office",
  "stickerQuery": "Mr Krabs money",
  "durationSeconds": 7,
  "stylePreset": "sky-face"
}

# Self-verification (do this before finalizing)
Before outputting JSON, silently verify:
- The hook is FUNNY and under 95 characters — not a slogan, not corporate.
- The sticker creates unexpected comedic contrast — not the default "surprised man".
- pexelsQuery is aesthetic and concrete (e.g. "aesthetic brunch table flatlay"), never generic (e.g. "video", "background").
- stickerQuery is 1-3 concrete words naming a specific transparent reaction/person/object.
- facts are punchy one-liners, not marketing copy.
- You picked a hook archetype you have NOT already used in this conversation.

Return ONLY the final JSON plan. No reasoning in the output.`;

export async function buildAnthropicPlan(
  message: string,
  site: SiteContext | null,
  history: ChatMessage[]
): Promise<{ usedAI: true; plan: RenderPlan } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

  if (!apiKey) return null;

  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
    max_tokens: 1200,
    temperature: 0.85,
    system: PLAN_SYSTEM_PROMPT,
    messages: [
      ...sanitizeAnthropicHistory(history),
      {
        role: "user",
        content: `First, in 2-3 sentences, identify the funniest unexpected angle for this product. What is the contradiction, the relatable pain, or the absurd gap? Which hook archetype fits best?\n\nThen output the final JSON plan matching this exact shape:\n${JSON.stringify({
          productName: "string",
          category: "string",
          hook: "top meme caption under 95 chars",
          caption: "one sentence under 130 chars",
          cta: "short CTA under 40 chars",
          facts: ["five short punchy fact lines for video text layers"],
          pexelsQuery: "1-4 concrete words for an aesthetic vertical background",
          stickerQuery: "1-3 words naming one specific funny transparent reaction sticker/person/object",
          durationSeconds: 7,
          stylePreset: "one of office-cutout, sky-face, cafe-reaction",
        }, null, 2)}\n\nProduct brief and site context:\n${JSON.stringify({ message, site })}`,
      },
    ],
  });

  const text = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();

  return {
    usedAI: true,
    plan: JSON.parse(extractJson(text)) as RenderPlan,
  };
}

export async function buildConversationalReply(
  message: string,
  history: ChatMessage[]
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

  if (!apiKey) {
    return "I make short UGC videos. Send a product URL or a quick pitch and I’ll build one with background video, sticker, text, and audio.";
  }

  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
    max_tokens: 300,
    temperature: 0.8,
    system:
      "You are the assistant in a UGC video maker chat app. Chat naturally and warmly. Handle greetings, small talk, jokes, and questions normally. Your one main capability: when the user sends a product URL or pitch, you assemble a short UGC marketing video with background video, trendy text, audio, and a GIF sticker. When it fits, invite them to send a product URL or pitch. Keep replies to 1-3 short sentences. Plain text only.",
    messages: [
      ...sanitizeAnthropicHistory(history),
      {
        role: "user",
        content: message,
      },
    ],
  });

  const reply = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();

  return (
    reply ||
    "I make short UGC videos. Send a product URL or a quick pitch and I’ll build one."
  );
}

export function sanitizeAnthropicHistory(
  history: ChatMessage[]
): AnthropicChatMessage[] {
  const cleaned = history
    .slice(-8)
    .filter(
      (item) =>
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string" &&
        item.content.trim()
    )
    .map((item) => ({
      role: item.role,
      content: item.content.trim().slice(0, 1200),
    }));

  const merged: AnthropicChatMessage[] = [];

  for (const item of cleaned) {
    const last = merged[merged.length - 1];

    if (last?.role === item.role) {
      last.content = `${last.content}\n${item.content}`;
    } else {
      merged.push(item);
    }
  }

  return merged;
}

function extractJson(text: string): string {
  // 1. Prefer a fenced ```json block — the most reliable signal.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  // 2. Find the last balanced top-level {...} object in the text. This handles
  //    chain-of-thought reasoning that may contain stray braces before the JSON.
  let depth = 0;
  let start = -1;
  let lastStart = -1;
  let lastEnd = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        lastStart = start;
        lastEnd = i;
      }
    }
  }

  if (lastStart >= 0 && lastEnd > lastStart) {
    return text.slice(lastStart, lastEnd + 1);
  }

  // 3. Last resort: first { to last } (original behavior).
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");

  if (first >= 0 && last > first) {
    return text.slice(first, last + 1);
  }

  return text;
}
