import "@fontsource-variable/archivo/wdth.css";
import { type DragEvent, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Box, Button, CssBaseline, LinearProgress, TextField, Typography } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import type { PanelResult } from "../backend/design/panel";
import { DEFAULT_ASSUMPTIONS, type Design, STARTERS } from "../backend/design/parts";
import type { Workload } from "../backend/schema";
import { Masthead } from "./results";
import { condensed, ink, label, muted, red, rule, theme } from "./theme";
import { Workspace } from "./workspace";

type Bill = { workload: Workload; fileName: string; sample: boolean; id: string | null };
type State =
  | { kind: "entry"; error?: string; busy?: string; picking?: boolean; drafting?: boolean; draftError?: string }
  | { kind: "design"; design: Design }
  | ({ kind: "bill" } & Bill);
type ApiResult = { id: string | null; workload: Workload } | { error: string };

async function readJson(res: Response): Promise<ApiResult> {
  try {
    return await res.json();
  } catch {
    return { error: res.status === 413 ? "File too large. The limit is 10 MB." : "The server didn't answer. Try again in a moment." };
  }
}

function App() {
  const [state, setState] = useState<State>({ kind: "entry" });
  const [idea, setIdea] = useState("");
  const [nums, setNums] = useState({ requestsPerDay: "", dataGb: "" });
  const [hint, setHint] = useState("");
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [designsOn, setDesignsOn] = useState(false);

  useEffect(() => {
    fetch("/config").then((r) => r.json()).then((c) => setDesignsOn(!!c.designs)).catch(() => {});
  }, []);

  useEffect(() => {
    const id = new URLSearchParams(location.search).get("e");
    if (!id) return;
    setState({ kind: "entry", busy: "shared estimate" });
    fetch(`/api/estimates/${encodeURIComponent(id)}`).then(async (res) => {
      const body = await readJson(res);
      setState("error" in body ? { kind: "entry", error: res.status === 404 ? "This share link doesn't exist or has been removed." : body.error } : { kind: "bill", id: body.id, workload: body.workload, fileName: "Shared estimate", sample: false });
    }).catch(() => setState({ kind: "entry", error: "Couldn't reach SwitchYard. Check your connection and try again." }));
  }, []);

  async function upload(file: File, sample = false) {
    setState({ kind: "entry", busy: file.name });
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/estimates", { method: "POST", body: form });
      const body = await readJson(res);
      if ("error" in body) return setState({ kind: "entry", error: body.error });
      if (body.id) history.replaceState(null, "", `/?e=${body.id}`);
      setState({ kind: "bill", id: body.id, workload: body.workload, fileName: file.name, sample });
    } catch {
      setState({ kind: "entry", error: "Couldn't reach SwitchYard. Check your connection and try again." });
    }
  }

  async function trySample() {
    const blob = await (await fetch("/sample-bill.pdf")).blob();
    upload(new File([blob], "aws-invoice-sample.pdf", { type: "application/pdf" }), true);
  }

  const MODEL_NAME: Record<string, string> = { "z-ai/glm-5.3": "GLM 5.3", "deepseek/deepseek-v4-flash": "DeepSeek V4", "openai/gpt-6.1-sol": "GPT-6.1 Sol" };
  const name = (m: string) => MODEL_NAME[m] ?? m;
  const optNum = (v: string) => (v.trim() === "" ? undefined : Math.max(0, Number(v) || 0));

  async function priceIdea() {
    if (idea.trim().split(/\s+/).length < 6) return setHint("Add who uses it and what it does, in a sentence or two.");
    setHint("");
    if (!designsOn) return setState({ kind: "entry", picking: true });

    abort.current = new AbortController();
    setState({ kind: "entry", drafting: true });
    try {
      const res = await fetch("/api/designs", { method: "POST", signal: abort.current.signal, headers: { "content-type": "application/json" },
        body: JSON.stringify({ idea: idea.trim(), requestsPerDay: optNum(nums.requestsPerDay), dataGb: optNum(nums.dataGb) }) });
      const body = await res.json();
      if (!res.ok) return setState({ kind: "entry", picking: true, draftError: body.error });
      const r = body as PanelResult & { cached?: boolean };
      const ok = r.models.filter((m) => m.ok).map((m) => name(m.model));
      const failed = r.models.filter((m) => !m.ok).map((m) => name(m.model));
      const panelNote = r.escalated
        ? `${failed.length ? `${failed.join(" and ")} didn't answer` : "GLM 5.3 and DeepSeek V4 disagreed"}${r.disputes.length && !failed.length ? ` (${r.disputes.join(", ")})` : ""}, so ${ok.join(", ")} voted.`
        : `Drafted by ${ok.join(" and ")}; they agreed.`;
      setState({ kind: "design", design: {
        idea: idea.trim(), parts: r.parts, panelNote: panelNote + (r.cached ? " (Saved draft.)" : ""),
        questions: r.questions,
        assumptions: { ...r.assumptions, requestsPerDay: Math.round(r.assumptions.requestsPerDay), trafficShape: r.trafficShape },
      } });
    } catch (e) {
      if ((e as Error).name === "AbortError") return setState({ kind: "entry" });
      setState({ kind: "entry", picking: true, draftError: "Couldn't reach the drafting service. Start from a starter design instead." });
    }
  }

  function pick(starterId: string) {
    const s = STARTERS.find((x) => x.id === starterId)!;
    const n = (v: string, d: number) => (v.trim() === "" ? d : Math.max(0, Number(v) || 0));
    setState({ kind: "design", design: { idea: idea.trim(), parts: s.parts.map((p) => ({ ...p })), assumptions: { ...DEFAULT_ASSUMPTIONS, requestsPerDay: n(nums.requestsPerDay, DEFAULT_ASSUMPTIONS.requestsPerDay), dataGb: n(nums.dataGb, DEFAULT_ASSUMPTIONS.dataGb) } } });
  }

  const reset = () => {
    history.replaceState(null, "", "/");
    setState({ kind: "entry" });
  };

  if (state.kind === "design") return <Workspace mode="design" design={state.design} setDesign={(design) => setState({ kind: "design", design })} onReset={reset} />;
  if (state.kind === "bill") return <Workspace mode="bill" {...state} onReset={reset} />;

  const drop = (ev: DragEvent) => {
    ev.preventDefault();
    setOver(false);
    const file = ev.dataTransfer.files[0];
    if (file && !state.busy) upload(file);
  };

  return (
    <>
      <Masthead><Typography sx={{ fontSize: 14, ml: { md: "auto" } }}>Independent. Not affiliated with Railway or AWS.</Typography></Masthead>
      <Box component="main" sx={{ px: { xs: 2, md: 5 }, py: { xs: 4, md: 6 }, maxWidth: 1100, mx: "auto" }}>
        <Typography component="h1" sx={{ ...condensed, fontSize: { xs: 36, md: 56 }, lineHeight: 1, maxWidth: "18ch", textWrap: "balance" }}>
          What would it cost on Railway and on AWS?
        </Typography>

        <Box component="section" aria-labelledby="describe" sx={{ mt: 4, borderTop: `4px solid ${ink}`, pt: 2.5 }}>
          <Typography id="describe" component="h2" sx={{ fontWeight: 700, fontSize: { xs: 18, md: 22 } }}>What are you building?</Typography>
          <TextField multiline minRows={4} fullWidth value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="A booking app for dental clinics. About 500 clinics. Patients book appointments online, we text them a reminder the day before, and clinic staff have an admin dashboard."
            slotProps={{ htmlInput: { "aria-label": "Describe your idea" } }} sx={{ mt: 1.5, "& .MuiOutlinedInput-root": { borderRadius: 0, fontSize: 17 }, "& fieldset": { borderColor: ink } }} />
          <Box sx={{ display: "flex", gap: 2, mt: 2, flexWrap: "wrap", alignItems: "flex-end" }}>
            <Box><Typography sx={{ ...label, mb: 0.5 }}>Requests a day <span style={{ color: muted, textTransform: "none", letterSpacing: 0 }}>(optional)</span></Typography>
              <TextField size="small" type="number" value={nums.requestsPerDay} onChange={(e) => setNums({ ...nums, requestsPerDay: e.target.value })} placeholder="50000" slotProps={{ htmlInput: { min: 0, "aria-label": "Requests a day" } }} /></Box>
            <Box><Typography sx={{ ...label, mb: 0.5 }}>Data size GB <span style={{ color: muted, textTransform: "none", letterSpacing: 0 }}>(optional)</span></Typography>
              <TextField size="small" type="number" value={nums.dataGb} onChange={(e) => setNums({ ...nums, dataGb: e.target.value })} placeholder="5" slotProps={{ htmlInput: { min: 0, "aria-label": "Data size in GB" } }} /></Box>
            <Button variant="contained" size="large" onClick={priceIdea} sx={{ ml: { sm: "auto" } }}>Price it</Button>
          </Box>
          {hint && <Typography role="alert" sx={{ mt: 1.5, color: red, fontWeight: 600 }}>{hint}</Typography>}
          <Typography sx={{ mt: 1.5, fontSize: 14, color: muted }}>Your description goes to GLM 5.3 and DeepSeek V4 through OpenRouter (and GPT-6.1 Sol if they disagree) to sketch the parts. All the pricing is done in code.</Typography>

          {state.drafting && (
            <Box role="status" sx={{ mt: 3, maxWidth: 560 }}>
              <Typography sx={{ fontWeight: 700 }}>Sketching your design…</Typography>
              <Typography sx={{ color: muted, mb: 1 }}>Two models draft it independently; code checks whether they agree. Usually 10–20 seconds.</Typography>
              <LinearProgress />
              <Button variant="text" onClick={() => abort.current?.abort()} sx={{ mt: 1, p: 0, minWidth: 0, color: ink, textDecoration: "underline", textUnderlineOffset: 3 }}>Cancel</Button>
            </Box>
          )}

          {state.picking && (
            <Box sx={{ mt: 3, p: { xs: 2, md: 2.5 }, border: `1px solid ${ink}` }}>
              <Typography sx={{ fontWeight: 700 }}>{state.draftError ?? "Model drafting isn't set up on this deployment (no OpenRouter key)."}</Typography>
              <Typography sx={{ color: muted, mb: 1.5 }}>Pick the closest starting point. You can add, remove and resize every part next.</Typography>
              <Box sx={{ borderTop: `2px solid ${ink}` }}>
                {STARTERS.map((s) => (
                  <Box key={s.id} component="button" onClick={() => pick(s.id)} sx={{ all: "unset", cursor: "pointer", boxSizing: "border-box", width: "100%", display: "grid", gridTemplateColumns: { xs: "1fr", md: "260px 1fr auto" }, gap: { xs: 0.25, md: 2 }, alignItems: "baseline", py: 1.25, borderBottom: `1px solid ${rule}`, "&:hover, &:focus-visible": { bgcolor: "#FBE9EC" }, "&:focus-visible": { outline: `2px solid ${red}`, outlineOffset: 2 } }}>
                    <Typography sx={{ fontWeight: 700 }}>{s.label}</Typography>
                    <Typography sx={{ color: muted }}>{s.summary}</Typography>
                    <Typography sx={{ ...label, color: red }}>Use this →</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Box>

        <Box component="section" aria-labelledby="drop" onDragOver={(e) => (e.preventDefault(), setOver(true))} onDragLeave={() => setOver(false)} onDrop={drop}
          sx={{ mt: 6, borderTop: `1px solid ${ink}`, pt: 2.5, bgcolor: over ? "#FBE9EC" : "transparent", outline: over ? `2px dashed ${red}` : "none", outlineOffset: 6 }}>
          <Typography id="drop" component="h2" sx={{ fontWeight: 700, fontSize: { xs: 18, md: 22 } }}>Already running something? Drop a file</Typography>
          <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5, color: muted, display: "grid", gap: 0.5 }}>
            <li>An AWS bill: invoice PDF, Cost and Usage Report CSV, or FOCUS export</li>
            <li>A CloudFormation template (YAML or JSON) <em>· coming next</em></li>
            <li>Railway exports: <code>railway config pull --json</code> and <code>railway usage projects --project &lt;name&gt; --json</code> <em>· coming next</em></li>
          </Box>
          {state.busy ? (
            <Box role="status" sx={{ mt: 2, maxWidth: 520 }}><Typography sx={{ fontWeight: 700 }}>Reading {state.busy}…</Typography><LinearProgress sx={{ mt: 1 }} /></Box>
          ) : (
            <Box sx={{ display: "flex", gap: 2, mt: 2, alignItems: "center", flexWrap: "wrap" }}>
              <Button variant="outlined" onClick={() => input.current?.click()} sx={{ color: ink, borderColor: ink }}>Choose a file</Button>
              <Button variant="text" onClick={trySample} sx={{ color: ink, textDecoration: "underline", textUnderlineOffset: 3 }}>Try a sample bill (synthetic)</Button>
            </Box>
          )}
          {state.error && <Typography role="alert" sx={{ mt: 2, color: red, fontWeight: 600, maxWidth: "70ch" }}>{state.error}</Typography>}
          <Typography sx={{ mt: 2, fontSize: 14 }}><strong>Files never go to an LLM.</strong> Bills are deleted right after parsing; only the derived numbers are kept.</Typography>
          <input ref={input} type="file" hidden accept=".pdf,.csv,.json,.yaml,.yml,application/pdf,text/csv,application/json" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
        </Box>
      </Box>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <App />
  </ThemeProvider>,
);
