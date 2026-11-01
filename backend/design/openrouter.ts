import { DesignDraft, draftJsonSchema } from "./draft";
import type { Caller, DraftInput } from "./panel";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 20_000;
let rules: string | undefined;
const loadRules = async () => (rules ??= await Bun.file(new URL("./rules.md", import.meta.url)).text());

export const userMessage = (i: DraftInput) =>
  [`Description: "${i.idea.replace(/"/g, "'")}"`, i.requestsPerDay !== undefined && `The user says: about ${i.requestsPerDay} requests per day.`, i.dataGb !== undefined && `The user says: about ${i.dataGb} GB of data.`].filter(Boolean).join("\n");

/** One model, strict JSON-schema output, temperature 0. Retries once with the validation error. Only the idea text is sent. */
export function openRouterCaller(apiKey: string, fetchImpl: typeof fetch = fetch): Caller {
  return async (model, input, signal) => {
    const messages: { role: string; content: string }[] = [{ role: "system", content: await loadRules() }, { role: "user", content: userMessage(input) }];
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetchImpl(ENDPOINT, {
        method: "POST",
        signal: AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS), ...(signal ? [signal] : [])]),
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "x-title": "SwitchYard" },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 2000,
          messages,
          response_format: { type: "json_schema", json_schema: { name: "design_draft", strict: true, schema: draftJsonSchema } },
          provider: { require_parameters: true }, // only route to providers that honour the schema
        }),
      });
      if (!res.ok) throw new Error(`${model}: HTTP ${res.status}`);
      const content: string = (await res.json())?.choices?.[0]?.message?.content ?? "";
      try {
        return DesignDraft.parse(JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, "")));
      } catch (e) {
        lastError = e instanceof Error ? e.message.slice(0, 500) : "invalid JSON";
        messages.push({ role: "assistant", content }, { role: "user", content: `That did not match the schema: ${lastError}. Return corrected JSON only.` });
      }
    }
    throw new Error(`${model}: invalid output twice (${lastError.slice(0, 120)})`);
  };
}
