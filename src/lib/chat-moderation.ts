/**
 * Chat moderation using OpenAI Moderation API.
 * Flags harmful content (hate, harassment, violence, self-harm, sexual).
 * If OPENAI_API_KEY is not set, moderation is skipped (allowed).
 */

const OPENAI_MODERATIONS_URL = "https://api.openai.com/v1/moderations";

/** Model used for moderation when not set in env. OpenAI default is omni-moderation-latest. */
const DEFAULT_MODERATION_MODEL = "omni-moderation-latest";

type ModerationResult = {
  flagged: boolean;
  categories: Record<string, boolean>;
  category_scores?: Record<string, number>;
};

type ModerationResponse = {
  id: string;
  model: string;
  results: ModerationResult[];
};

export type ModerateChatResult =
  | { allowed: true }
  | { allowed: false; reason: string; code: string };

/**
 * Check chat message against OpenAI Moderation API.
 * Returns { allowed: true } or { allowed: false, reason, code }.
 * If OPENAI_API_KEY is missing, returns allowed: true (moderation skipped).
 */
export async function moderateChatMessage(
  text: string
): Promise<ModerateChatResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { allowed: true };
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return { allowed: true };
  }

  try {
    const res = await fetch(OPENAI_MODERATIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: trimmed,
        model: process.env.OPENAI_MODERATION_MODEL ?? DEFAULT_MODERATION_MODEL,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("OpenAI Moderation API error:", res.status, errText);
      return {
        allowed: false,
        reason: "Content check is temporarily unavailable. Please try again.",
        code: "MODERATION_ERROR",
      };
    }

    const data = (await res.json()) as ModerationResponse;
    const result = data.results?.[0];
    if (!result) {
      return { allowed: true };
    }

    if (!result.flagged) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason:
        "Your message was blocked because it may contain inappropriate content. Please keep the conversation respectful.",
      code: "CONTENT_BLOCKED",
    };
  } catch (error) {
    console.error("Chat moderation request failed:", error);
    return {
      allowed: false,
      reason: "Content check is temporarily unavailable. Please try again.",
      code: "MODERATION_ERROR",
    };
  }
}
