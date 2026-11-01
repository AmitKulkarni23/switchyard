import { adapters } from "./adapters";
import { detect } from "./detect";
import { classifyUnparsed, fallbackConfig } from "./llm/fallback";
import { normalize } from "./normalize";
import type { Workload } from "./schema";

/** upload bytes → detect → adapter (FOCUS) → [LLM fallback, off by default] → normalize (Workload). */
export async function analyze(bytes: Uint8Array): Promise<Workload> {
  const format = await detect(bytes);
  const { provider, rows, unparsed } = await adapters[format](bytes);
  const config = fallbackConfig();
  const extra = config.enabled ? await classifyUnparsed(unparsed, config) : [];
  return normalize({ provider, format, rows: [...rows, ...extra], unparsed: extra.length ? [] : unparsed });
}
