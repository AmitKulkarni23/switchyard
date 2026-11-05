import { DesignDraft, draftJsonSchema } from "./draft";
import type { Caller, DraftInput } from "./panel";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 30_000;
let rules: string | undefined;
const loadRules = async () => (rules ??= await Bun.file(new URL("./rules.md", import.meta.url)).text());

export const userMessage = (i: DraftInput) =>
  [`Description: "${i.idea.replace(/"/g, "'")}"`, i.requestsPerDay !== undefined && `The user says: about ${i.requestsPerDay} requests per day.`, i.dataGb !== undefined && `The user says: about ${i.dataGb} GB of data.`].filter(Boolean).join("\n");

/** One model, strict JSON-schema output, temperature 0. Retries once with the validation error. Only the idea text is sent. */
export function openRouterCaller(apiKey: string, fetchImpl: typeof fetch = fetch): Caller {
  return async (model, input, signal) => {
    const messages: { role: string; content: string }[] = [{ role: "system", content: await loadRules() }, { role: "user", content: userMessage(input) }];
    let lastError = "";
    let lastErrorType = "";
    // Low reasoning effort: GLM 5.3 answers in ~3 s instead of ~15 s on the same draft. Both settings are
    // dropped on retry if no provider accepts them (GPT-6.1 Sol rejects temperature).
    let tuning: { temperature?: number; reasoning?: { effort: string } } = { temperature: 0, reasoning: { effort: "low" } };
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetchImpl(ENDPOINT, {
        method: "POST",
        signal: AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS), ...(signal ? [signal] : [])]),
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "x-title": "SwitchYard" },
        body: JSON.stringify({
          model,
          ...tuning,
          max_tokens: 2000,
          messages,
          response_format: { type: "json_schema", json_schema: { name: "design_draft", strict: true, schema: draftJsonSchema } },
          provider: { require_parameters: true }, // only route to providers that honour the schema
        }),
      });
      if (res.status === 404 && Object.keys(tuning).length) {
        // require_parameters found no provider for these settings. Retry once without them.
        tuning = {};
        attempt--;
        continue;
      }
      if (!res.ok) {
        const detail = ((await res.json().catch(() => null))?.error?.message ?? "").slice(0, 160);
        throw new Error(`${model}: HTTP ${res.status}${detail ? ` ${detail}` : ""}`);
      }
      const content: string = (await res.json())?.choices?.[0]?.message?.content ?? "";
      try {
        return DesignDraft.parse(JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, "")));
      } catch (e) {
        lastError = e instanceof Error ? e.message.slice(0, 500) : "invalid JSON";
        lastErrorType = e instanceof Error ? e.name : "unknown";
        messages.push({ role: "assistant", content }, { role: "user", content: `That did not match the schema: ${lastError}. Return corrected JSON only.` });
      }
    }
    throw new Error(`${model}: invalid output twice (${lastErrorType})`); // this reaches the logs, and model output can echo the idea
  };
}
