import { compareDrafts, type Merged, mergeDrafts } from "./consensus";
import type { DesignDraft } from "./draft";

export type DraftInput = { idea: string; requestsPerDay?: number; dataGb?: number };
export type Caller = (model: string, input: DraftInput, signal?: AbortSignal) => Promise<DesignDraft>;
export type ModelRun = { model: string; ok: boolean; ms: number; error?: string };
export type PanelResult = Merged & { models: ModelRun[]; escalated: boolean; disputes: string[] };

export const PANEL = {
  primary: (process.env.DESIGN_PRIMARY_MODELS ?? "z-ai/glm-5.3,deepseek/deepseek-v4-flash").split(",").map((s) => s.trim()).filter(Boolean),
  tiebreak: process.env.DESIGN_TIEBREAK_MODEL ?? "openai/gpt-6.1-sol",
};

export class PanelError extends Error {
  constructor(message: string, readonly detail = "") {
    super(message);
  }
}

async function run(call: Caller, model: string, input: DraftInput, signal?: AbortSignal): Promise<{ run: ModelRun; draft?: DesignDraft }> {
  const t0 = performance.now();
  try {
    const draft = await call(model, input, signal);
    return { run: { model, ok: true, ms: Math.round(performance.now() - t0) }, draft };
  } catch (e) {
    return { run: { model, ok: false, ms: Math.round(performance.now() - t0), error: e instanceof Error ? e.message : String(e) } };
  }
}

/**
 * Cheap pair first, in parallel. If both answer and agree (checked in code), merge them.
 * Otherwise the tie-breaker drafts independently and code takes a per-field majority.
 * Stateless: no memory between requests.
 */
export async function draftDesign(input: DraftInput, call: Caller, panel = PANEL, signal?: AbortSignal): Promise<PanelResult> {
  const first = await Promise.all(panel.primary.map((m) => run(call, m, input, signal)));
  const ok = first.flatMap((r) => (r.draft ? [r.draft] : []));
  const cmp = ok.length === 2 ? compareDrafts(ok[0]!, ok[1]!) : { agree: false, disputes: ["a model didn't answer"] };
  if (cmp.agree) return { ...mergeDrafts(ok), models: first.map((r) => r.run), escalated: false, disputes: [] };

  const tie = await run(call, panel.tiebreak, input, signal);
  const drafts = [...ok, ...(tie.draft ? [tie.draft] : [])];
  const models = [...first.map((r) => r.run), tie.run];
  if (drafts.length < 2) {
    const why = models.filter((m) => !m.ok).map((m) => m.error).join("; ");
    throw new PanelError(`Only ${drafts.length} of ${models.length} models answered. Try again, or start from a starter design.`, why);
  }
  return { ...mergeDrafts(drafts), models, escalated: true, disputes: cmp.disputes };
}
