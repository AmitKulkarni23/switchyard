import { adapters } from "./adapters";
import { detect, UnsupportedFormatError } from "./detect";
import { classifyUnparsed, fallbackConfig } from "./llm/fallback";
import { normalize } from "./normalize";
import type { Workload } from "./schema";

const PARSE_TIMEOUT_MS = 10_000;
const MAX_COMPONENTS = 2000; // far above any real bill; keeps pricing and the results table responsive

/** A parser failure, described only by fixed labels. Raw messages could quote the bill, so they never leave the child. */
export class ParseFailedError extends Error {
  constructor(readonly fields: Record<string, unknown>) {
    super("parse failed");
  }
}

/** upload bytes → detect → adapter (FOCUS) → [LLM fallback, off by default] → normalize (Workload). */
export async function analyze(bytes: Uint8Array, onStep: (step: string) => void = () => {}): Promise<Workload> {
  onStep("detect");
  const format = await detect(bytes);
  // ponytail: CSV parsers are built but untested on real exports; remove this line once a real CUR and FOCUS file pass.
  if (format !== "aws-invoice-pdf") throw new UnsupportedFormatError("CSV exports aren't supported yet.", "csv_disabled");
  onStep("adapter");
  const { provider, rows, unparsed } = await adapters[format](bytes);
  const config = fallbackConfig();
  const extra = config.enabled ? await classifyUnparsed(unparsed, config) : [];
  onStep("normalize");
  const workload = normalize({ provider, format, rows: [...rows, ...extra], unparsed: extra.length ? [] : unparsed });
  if (workload.components.length > MAX_COMPONENTS) throw Object.assign(new Error("too many components"), { name: "ComponentLimitError" });
  return workload;
}

type ChildResult = { workload: Workload } | { unsupported: string; reason: string; errorType?: string } | { failed: { step: string; errorType: string } };

/**
 * analyze() in a child process that's killed at the deadline. Uploads are untrusted: a crafted file can
 * only waste its own process, never block the server or take it down with it. The child gets no environment
 * and skips .env files, so the parser never holds our secrets. ponytail: not a sandbox; add one if parsing grows riskier.
 */
export async function analyzeIsolated(bytes: Uint8Array): Promise<Workload> {
  const started = performance.now();
  const child = Bun.spawn([process.execPath, "--no-env-file", import.meta.path], { env: {}, stdin: bytes, stdout: "pipe", stderr: "ignore", timeout: PARSE_TIMEOUT_MS, killSignal: "SIGKILL" });
  const [out, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  const ms = Math.round(performance.now() - started);
  if (code === 137) throw new ParseFailedError({ reason: "killed", detail: "timed out or out of memory", ms });
  if (code !== 0) throw new ParseFailedError({ reason: "child_exit", exitCode: code, ms });
  let result: ChildResult;
  try {
    result = JSON.parse(out);
  } catch {
    throw new ParseFailedError({ reason: "bad_child_output", ms });
  }
  if ("workload" in result) return result.workload;
  if ("failed" in result) throw new ParseFailedError({ reason: "parser_error", ...result.failed, ms });
  throw Object.assign(new UnsupportedFormatError("", result.reason, result.errorType), { message: result.unsupported });
}

if (import.meta.main) {
  console.log = () => {}; // the PDF library logs warnings to stdout, which carries the result
  const bytes = await Bun.stdin.bytes();
  let step = "start";
  const result: ChildResult = await analyze(bytes, (s) => (step = s)).then(
    (workload) => ({ workload }),
    (e) => (e instanceof UnsupportedFormatError ? { unsupported: e.message, reason: e.reason, errorType: e.errorType } : { failed: { step, errorType: e instanceof Error ? e.name : "unknown" } }),
  );
  await Bun.write(Bun.stdout, JSON.stringify(result));
}
