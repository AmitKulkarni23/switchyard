import "@fontsource-variable/archivo/wdth.css";
import { type DragEvent, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Box, Button, CssBaseline, LinearProgress, Typography } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import type { Estimate, Workload } from "../backend/schema";
import { Mark, Masthead, OUTCOME_LABEL, Results, type Outcome } from "./results";
import { condensed, ink, label, muted, red, rule, theme } from "./theme";

type Loaded = { id: string | null; workload: Workload; fileName: string; sample: boolean };
type State = { kind: "idle" } | { kind: "busy"; fileName: string } | { kind: "error"; message: string } | ({ kind: "loaded" } & Loaded);
type ApiResult = { id: string | null; workload: Workload; estimate: Estimate } | { error: string };

const LEGEND: [Outcome, string][] = [
  ["moves", "Runs on Railway, priced on the CPU, memory, storage and egress it would use."],
  ["disappears", "AWS-only overhead with no Railway charge: NAT gateways, load balancers, transfer between zones."],
  ["no-equivalent", "Railway has nothing like it, so it stays on AWS at today's cost."],
  ["not-priced", "A line we couldn't map. Shown, never dropped, and left out of both totals."],
];

async function readJson(res: Response): Promise<ApiResult> {
  try {
    return await res.json();
  } catch {
    return { error: res.status === 413 ? "File too large. The limit is 10 MB." : "The server didn't answer. Try again in a moment." };
  }
}

function App() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Share links: /?e=<id>
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("e");
    if (!id) return;
    setState({ kind: "busy", fileName: "shared estimate" });
    fetch(`/api/estimates/${encodeURIComponent(id)}`)
      .then(async (res) => {
        const body = await readJson(res);
        if ("error" in body) setState({ kind: "error", message: res.status === 404 ? "This share link doesn't exist or has been removed." : body.error });
        else setState({ kind: "loaded", id: body.id, workload: body.workload, fileName: "Shared estimate", sample: false });
      })
      .catch(() => setState({ kind: "error", message: "Couldn't reach SwitchYard. Check your connection and try again." }));
  }, []);

  async function upload(file: File, sample = false) {
    setState({ kind: "busy", fileName: file.name });
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/estimates", { method: "POST", body: form });
      const body = await readJson(res);
      if ("error" in body) return setState({ kind: "error", message: body.error });
      if (body.id) history.replaceState(null, "", `/?e=${body.id}`);
      setState({ kind: "loaded", id: body.id, workload: body.workload, fileName: file.name, sample });
    } catch {
      setState({ kind: "error", message: "Couldn't reach SwitchYard. Check your connection and try again." });
    }
  }

  async function trySample() {
    const blob = await (await fetch("/sample-bill.pdf")).blob();
    upload(new File([blob], "aws-invoice-sample.pdf", { type: "application/pdf" }), true);
  }

  const reset = () => {
    history.replaceState(null, "", "/");
    setState({ kind: "idle" });
  };

  if (state.kind === "loaded") return <Results {...state} onReset={reset} />;

  const drop = (ev: DragEvent) => {
    ev.preventDefault();
    setOver(false);
    const file = ev.dataTransfer.files[0];
    if (file && state.kind !== "busy") upload(file);
  };

  return (
    <>
      <Masthead>
        <Typography sx={{ fontSize: 14, ml: { md: "auto" } }}>Independent. Not affiliated with Railway or AWS.</Typography>
      </Masthead>
      <Box component="main" sx={{ px: { xs: 2, md: 5 }, py: { xs: 5, md: 8 }, maxWidth: 1200, mx: "auto" }}>
        <Typography component="h1" sx={{ ...condensed, fontSize: { xs: 36, md: 60 }, lineHeight: 1, maxWidth: "16ch", textWrap: "balance" }}>
          What would your AWS bill cost on Railway?
        </Typography>
        <Typography sx={{ mt: 2.5, fontSize: { xs: 16, md: 18 }, maxWidth: "62ch", color: muted }}>
          Drop an AWS invoice PDF, a Cost and Usage Report CSV or a FOCUS export. You get today's cost against a Railway range, what disappears, and what has no Railway equivalent. Every number is computed from your bill and Railway's published rates.
        </Typography>

        <Box
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
          sx={{ mt: 5, borderTop: `4px solid ${ink}`, borderBottom: `1px solid ${ink}`, bgcolor: over ? "#FBE9EC" : "#fff", outline: over ? `2px dashed ${red}` : "none", outlineOffset: -10, transition: "background-color .15s ease-out",
            minHeight: 220, display: "grid", alignContent: "center", justifyItems: "start", gap: 2, px: { xs: 2, md: 4 }, py: 4 }}>
          {state.kind === "busy" ? (
            <Box sx={{ width: "100%", maxWidth: 560 }} role="status">
              <Typography sx={{ fontWeight: 700, fontSize: 18 }}>Reading {state.fileName}…</Typography>
              <Typography sx={{ color: muted, mt: 0.5, mb: 2 }}>Detecting the format, matching every line, pricing it on Railway.</Typography>
              <LinearProgress color="primary" />
            </Box>
          ) : state.kind === "error" ? (
            <Box role="alert">
              <Typography sx={{ fontWeight: 700, fontSize: 18, color: red }}>We couldn't price that file</Typography>
              <Typography sx={{ mt: 0.5, maxWidth: "65ch" }}>{state.message}</Typography>
              <Button variant="contained" sx={{ mt: 2 }} onClick={() => input.current?.click()}>Choose another file</Button>
            </Box>
          ) : (
            <>
              <Typography sx={{ fontWeight: 700, fontSize: { xs: 18, md: 22 } }}>{over ? "Drop to price it" : "Drop your bill here"}</Typography>
              <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
                <Button variant="contained" size="large" onClick={() => input.current?.click()}>Choose a file</Button>
                <Button variant="text" onClick={trySample} sx={{ color: ink, textDecoration: "underline", textUnderlineOffset: 3 }}>Try a sample bill (synthetic)</Button>
              </Box>
              <Typography sx={{ color: muted, fontSize: 14 }}>PDF or CSV, up to 10 MB.</Typography>
            </>
          )}
          <input ref={input} type="file" hidden accept=".pdf,.csv,application/pdf,text/csv" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
        </Box>

        <Typography sx={{ mt: 2, fontSize: 14 }}>
          <strong>Your bill is deleted right after parsing and never sent to an LLM.</strong> Only the derived numbers are kept, so you can share the result.
        </Typography>

        <Box component="section" sx={{ mt: 8 }} aria-labelledby="legend">
          <Typography id="legend" component="h2" sx={{ ...condensed, fontSize: 20, mb: 1 }}>How each line is rated</Typography>
          <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: { xs: "1fr", md: "220px 1fr" }, borderTop: `2px solid ${ink}` }}>
            {LEGEND.map(([o, text]) => (
              <Box key={o} sx={{ display: "contents", "& > *": { py: 1.5, borderBottom: `1px solid ${rule}`, m: 0 } }}>
                <Box component="dt" sx={{ display: "flex", alignItems: "center", gap: 1.25, fontWeight: 700, borderBottom: { xs: "0 !important", md: `1px solid ${rule} !important` }, pb: { xs: "0 !important", md: "12px !important" } }}>
                  <Mark outcome={o} />{OUTCOME_LABEL[o]}
                </Box>
                <Box component="dd" sx={{ color: muted }}>{text}</Box>
              </Box>
            ))}
          </Box>
          <Typography sx={{ ...label, color: muted, mt: 2 }}>Destination: Railway</Typography>
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
