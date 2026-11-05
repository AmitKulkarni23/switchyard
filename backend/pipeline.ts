import { adapters } from "./adapters";
import { detect, UnsupportedFormatError } from "./detect";
import { classifyUnparsed, fallbackConfig } from "./llm/fallback";
import { normalize } from "./normalize";
import type { Workload } from "./schema";

const PARSE_TIMEOUT_MS = 10_000;
const MAX_COMPONENTS = 2000; // far above any real bill; keeps pricing and the results table responsive

/** upload bytes → detect → adapter (FOCUS) → [LLM fallback, off by default] → normalize (Workload). */
export async function analyze(bytes: Uint8Array): Promise<Workload> {
  const format = await detect(bytes);
  // ponytail: CSV parsers are built but untested on real exports; remove this line once a real CUR and FOCUS file pass.
  if (format !== "aws-invoice-pdf") throw new UnsupportedFormatError("CSV exports aren't supported yet.");
  const { provider, rows, unparsed } = await adapters[format](bytes);
  const config = fallbackConfig();
  const extra = config.enabled ? await classifyUnparsed(unparsed, config) : [];
  const workload = normalize({ provider, format, rows: [...rows, ...extra], unparsed: extra.length ? [] : unparsed });
  if (workload.components.length > MAX_COMPONENTS) throw new Error(`too many components: ${workload.components.length}`);
  return workload;
}

/**
 * analyze() in a child process that's killed at the deadline. Uploads are untrusted: a crafted file can
 * only waste its own process, never block the server or take it down with it.
 */
export async function analyzeIsolated(bytes: Uint8Array): Promise<Workload> {
  const child = Bun.spawn([process.execPath, import.meta.path], { stdin: bytes, stdout: "pipe", stderr: "ignore", timeout: PARSE_TIMEOUT_MS, killSignal: "SIGKILL" });
  const [out, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  if (code !== 0) throw new Error(`parser exited with ${code}`);
  const result = JSON.parse(out) as { workload: Workload } | { unsupported: string };
  if ("workload" in result) return result.workload;
  throw Object.assign(new UnsupportedFormatError(""), { message: result.unsupported });
}

if (import.meta.main) {
  console.log = () => {}; // the PDF library logs warnings to stdout, which carries the result
  const bytes = await Bun.stdin.bytes();
  const result = await analyze(bytes).then(
    (workload) => ({ workload }),
    (e) => {
      if (e instanceof UnsupportedFormatError) return { unsupported: e.message };
      process.exit(1); // the parent logs a generic failure; never bill content
    },
  );
  await Bun.write(Bun.stdout, JSON.stringify(result));
}
