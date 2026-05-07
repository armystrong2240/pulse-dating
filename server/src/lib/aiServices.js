/**
 * AI services: icebreaker generation and content moderation.
 * Requires OPENAI_API_KEY env var. Gracefully degrades to static fallbacks.
 */
import { OPENAI_API_KEY } from "../config/env.js";

const BASE_URL = "https://api.openai.com/v1";

async function openAIChat(messages, { maxTokens = 150, temperature = 0.8 } = {}) {
  if (!OPENAI_API_KEY) return null;
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

// ── AI-powered icebreaker ─────────────────────────────────────────────────
const STATIC_ICEBREAKERS = [
  "You both love {interest} — ask them about their favorite experience with it!",
  "You're both into {interest}. What's your best {interest} story?",
  "Fellow {interest} fan spotted! Break the ice: what got you into it?",
  "Ask them: if you could do {interest} anywhere in the world, where would it be?",
  "You two clearly have great taste — {interest} is a perfect conversation starter!",
];

export async function generateIcebreaker(meProfile, themProfile) {
  const meInts = (() => { try { return JSON.parse(meProfile.interests || "[]"); } catch { return []; } })();
  const themInts = (() => { try { return JSON.parse(themProfile.interests || "[]"); } catch { return []; } })();
  const shared = meInts.filter((i) => themInts.includes(i));

  // Try AI first if key is set
  if (OPENAI_API_KEY) {
    const context = [
      `Person A: ${meProfile.name}, ${meProfile.age}, interested in: ${meInts.join(", ")}`,
      `Person B: ${themProfile.name}, ${themProfile.age}, interested in: ${themInts.join(", ")}`,
      `Shared interests: ${shared.join(", ") || "none listed"}`,
      `Looking for: ${meProfile.lookingFor || "connection"}`,
    ].join("\n");

    const suggestion = await openAIChat([
      {
        role: "system",
        content:
          "You are a witty dating coach. Generate ONE short, genuine, non-cringe opening message suggestion (max 2 sentences) that Person A could send to Person B on a dating app. Be specific to their shared interests. Respond with just the message, no quotes.",
      },
      { role: "user", content: context },
    ], { maxTokens: 80, temperature: 0.9 });

    if (suggestion) return suggestion;
  }

  // Static fallback
  if (!shared.length) return null;
  const interest = shared[Math.floor(Math.random() * shared.length)];
  const template = STATIC_ICEBREAKERS[Math.floor(Math.random() * STATIC_ICEBREAKERS.length)];
  return template.replaceAll("{interest}", interest.toLowerCase());
}

// ── Content moderation ────────────────────────────────────────────────────
/**
 * Returns { safe: boolean, flaggedCategories: string[], confidence: number }
 * Uses OpenAI moderation API (free endpoint).
 */
export async function moderateText(text) {
  if (!OPENAI_API_KEY || !text?.trim()) return { safe: true, flaggedCategories: [], confidence: 1 };

  try {
    const res = await fetch(`${BASE_URL}/moderations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ input: text }),
    });
    if (!res.ok) return { safe: true, flaggedCategories: [], confidence: 0 };
    const data = await res.json();
    const result = data.results?.[0];
    if (!result) return { safe: true, flaggedCategories: [], confidence: 0 };

    const flagged = Object.entries(result.categories)
      .filter(([, v]) => v)
      .map(([k]) => k);

    return {
      safe: !result.flagged,
      flaggedCategories: flagged,
      confidence: result.flagged ? 1 : 0,
    };
  } catch {
    return { safe: true, flaggedCategories: [], confidence: 0 };
  }
}

/**
 * Moderate an image URL via OpenAI vision.
 * Returns { safe: boolean, reason: string|null }
 */
export async function moderateImage(imageUrl) {
  if (!OPENAI_API_KEY || !imageUrl) return { safe: true, reason: null };

  try {
    const result = await openAIChat([
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Is this image safe for a dating app? Respond with JSON only: {\"safe\": true/false, \"reason\": \"brief reason if not safe or null\"}",
          },
          { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
        ],
      },
    ], { maxTokens: 60, temperature: 0 });

    if (!result) return { safe: true, reason: null };
    const parsed = JSON.parse(result.replace(/```json|```/g, "").trim());
    return { safe: !!parsed.safe, reason: parsed.reason || null };
  } catch {
    return { safe: true, reason: null };
  }
}
