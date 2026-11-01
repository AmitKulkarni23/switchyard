import type { FocusRow, UnpricedLine } from "../schema";

/**
 * Optional LLM fallback for bill lines the deterministic parsers couldn't map (OpenRouter).
 * v1: designed, disabled, unimplemented. The app never needs an API key; with the default
 * config this returns [] without touching the network.
 */
export type FallbackConfig = { enabled: boolean; apiKey?: string };

export const fallbackConfig = (env: Record<string, string | undefined> = process.env): FallbackConfig => ({
  enabled: env.LLM_FALLBACK_ENABLED === "true" && !!env.OPENROUTER_API_KEY,
  apiKey: env.OPENROUTER_API_KEY,
});

export async function classifyUnparsed(lines: UnpricedLine[], config: FallbackConfig = fallbackConfig()): Promise<FocusRow[]> {
  if (!config.enabled || lines.length === 0) return [];
  // When implemented: send only line descriptions and amounts (never the raw bill) to OpenRouter,
  // validate the response with FocusRow, and let normalize/price do all the math.
  throw new Error("LLM fallback is not implemented in v1. Set LLM_FALLBACK_ENABLED=false.");
}
