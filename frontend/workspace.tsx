import { Fragment, type ReactNode, useMemo, useState } from "react";
import { Box, Button, Checkbox, MenuItem, Select, Slider, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { compareBoth } from "../backend/compare";
import { railwayPriceBook } from "../backend/data/price-books";
import { awsPriceBook } from "../backend/pricers/aws";
import { TOPIC_OPTIONS } from "../backend/design/draft";
import { type Design, designToWorkload, isSized, type NumberKey, PART_LABEL, PART_TYPES, type PartType, relevantNumbers, SHAPE_UTILIZATION, type Tier, type TrafficShape } from "../backend/design/parts";
import type { Workload } from "../backend/schema";
import { Mark, Masthead } from "./results";
import { condensed, figures, ink, label, muted, red, rule, wash } from "./theme";

const usd = (n: number) => (n > 0 && n < 1 ? "<$1" : `$${Math.round(Math.abs(n)).toLocaleString("en-US")}`);
const range = (r: { low: number; high: number }) => (Math.round(r.low) === Math.round(r.high) ? usd(r.low) : `${usd(r.low)} – ${usd(r.high)}`);
const pctRange = ([a, b]: number[]) => (a === b ? `${a}%` : `${a}–${b}%`);

type Props =
  | { mode: "design"; design: Design; setDesign: (d: Design) => void; onReset: () => void }
  | { mode: "bill"; workload: Workload; fileName: string; sample: boolean; id: string | null; onReset: () => void };

export function Workspace(props: Props) {
  const initialBusy = props.mode === "design" ? SHAPE_UTILIZATION[props.design.assumptions.trafficShape] : [10, 50];
  const [busy, setBusy] = useState<number[]>(initialBusy);
  const [mustKeep, setMustKeep] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(props.mode === "design");

  const workload = useMemo(() => (props.mode === "design" ? designToWorkload(props.design) : props.workload), [props]);
  const { railway, aws } = useMemo(() => compareBoth(workload, { utilization: { low: busy[0]! / 100, high: busy[1]! / 100 }, mustKeep }), [workload, busy, mustKeep]);

  const guessCount = props.mode === "design" ? relevantNumbers(props.design.parts).filter((k) => props.design.guessed?.includes(k)).length : 0;
  const diff = { low: aws.total.low - railway.destinationTotal.high, high: aws.total.high - railway.destinationTotal.low };
  const cheaper = diff.low >= 0 ? "Railway" : diff.high <= 0 ? "AWS" : null;
  const source = props.mode === "design" ? `Your idea · ${workload.components.length} parts · illustrative, edit anything` : [props.fileName, props.sample && "sample bill (synthetic)", `${workload.components.length} parts from your bill`].filter(Boolean).join(" · ");
  const share = props.mode === "bill" && props.id;

  return (
    <>
      <Masthead>
        <Typography sx={{ fontSize: 14, minWidth: 0, overflowWrap: "anywhere" }}>{source}</Typography>
        <Box className="no-print" sx={{ ml: { md: "auto" }, display: "flex", gap: 1.5 }}>
          <Button variant="outlined" onClick={props.onReset} sx={{ color: "#fff", borderColor: "#fff", "&:hover": { borderColor: "#fff", bgcolor: "rgba(255,255,255,.12)" } }}>Start over</Button>
          <Button variant="outlined" onClick={() => print()} sx={{ color: "#fff", borderColor: "#fff", "&:hover": { borderColor: "#fff", bgcolor: "rgba(255,255,255,.12)" } }}>Export PDF</Button>
          <Button variant="contained" disabled={!share} title={share ? undefined : "Share links for designs come with the idea path"}
            onClick={() => share && navigator.clipboard.writeText(`${location.origin}/?e=${props.id}`)}
            sx={{ bgcolor: "#fff", color: red, "&:hover": { bgcolor: "#fff" }, "&.Mui-disabled": { bgcolor: "rgba(255,255,255,.6)", color: red } }}>Share link</Button>
        </Box>
      </Masthead>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(420px, 40%) 1fr" }, minHeight: "calc(100vh - 60px)" }}>
        {/* ---------- left: what you told us ---------- */}
        <Box component="aside" className="no-print" sx={{ bgcolor: wash, borderRight: { lg: `1px solid ${ink}` }, borderBottom: { xs: `1px solid ${ink}`, lg: 0 }, px: { xs: 2, md: 3.5 }, py: 3, order: { xs: 2, lg: 1 } }}>
          <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <Typography component="h2" sx={{ ...condensed, fontSize: 18 }}>What you told us</Typography>
            {props.mode === "bill" && <Button variant="text" onClick={() => setLeftOpen(!leftOpen)} sx={{ color: ink, textDecoration: "underline", textUnderlineOffset: 3, p: 0, minWidth: 0 }}>{leftOpen ? "Hide" : "Edit"}</Button>}
          </Box>

          {props.mode === "design" ? (
            <DesignPanel design={props.design} setDesign={(d) => { if (d.assumptions.trafficShape !== props.design.assumptions.trafficShape) setBusy(SHAPE_UTILIZATION[d.assumptions.trafficShape]); props.setDesign(d); }} />
          ) : (
            <Typography sx={{ mt: 1, color: muted }}>{props.workload.components.length} parts read from {props.fileName}. {railway.notPriced.length ? `${railway.notPriced.length} line${railway.notPriced.length > 1 ? "s" : ""} not priced.` : ""} Tick "Must keep" in the table to leave a part on AWS.</Typography>
          )}

          <Box sx={{ mt: 3, pt: 2, borderTop: `1px solid ${rule}` }}>
            <Typography id="busy" sx={{ ...label }}>How busy are your servers?</Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 1 }}>
              <Slider aria-labelledby="busy" value={busy} onChange={(_, v) => setBusy(v as number[])} min={0} max={100} step={5} getAriaValueText={(v) => `${v}% busy`}
                sx={{ color: red, maxWidth: 320, "& .MuiSlider-thumb": { width: 16, height: 16, borderRadius: 0 } }} />
              <Typography sx={{ ...figures, fontWeight: 700, minWidth: 64 }}>{pctRange(busy)}</Typography>
            </Box>
            <Typography sx={{ color: muted, fontSize: 13 }}>Railway bills what you use, so this moves the Railway side. AWS {aws.billed ? "is your bill as charged" : "bills what you provision, so it doesn't move"}.</Typography>
          </Box>
        </Box>

        {/* ---------- right: Railway vs AWS ---------- */}
        <Box component="main" sx={{ px: { xs: 2, md: 4 }, py: 3, order: { xs: 1, lg: 2 }, minWidth: 0 }}>
          <Box component="section" aria-label="Verdict" sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, borderTop: `4px solid ${ink}`, borderBottom: `1px solid ${ink}` }}>
            <Cell head="On Railway" value={range(railway.destinationTotal)} note={`per month · ${railway.plan.name === "None" ? "nothing moves" : `${railway.plan.name} plan`} · at ${pctRange(busy)} busy`} />
            <Cell head={aws.billed ? "AWS today (billed)" : "On AWS"} value={range(aws.total)} note={aws.billed ? "per month, priced lines only" : "per month · right-sized, us-east-1"} />
            <Cell head="Difference" value={cheaper ? range({ low: Math.abs(cheaper === "Railway" ? diff.low : diff.high), high: Math.abs(cheaper === "Railway" ? diff.high : diff.low) }) : `${usd(-diff.low)} more to ${usd(diff.high)} less`}
              note={cheaper ? `less per month on ${cheaper}` : "on Railway, depending on how busy you are"} accent={cheaper === "AWS" ? red : undefined} last />
          </Box>
          {guessCount > 0 && (
            <Typography role="status" sx={{ mt: 1, fontSize: 14, color: red, fontWeight: 600 }}>
              Based on {guessCount} guessed number{guessCount > 1 ? "s" : ""}. Check them on the left; prices update as you change them.
            </Typography>
          )}

          <Typography component="h2" sx={{ ...condensed, fontSize: 18, mt: 4, mb: 1 }}>Part by part</Typography>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Part</TableCell>
                  <TableCell>Railway uses</TableCell>
                  <TableCell align="right">Railway /mo</TableCell>
                  <TableCell>AWS {aws.billed ? "today" : "uses"}</TableCell>
                  <TableCell align="right">AWS /mo</TableCell>
                  {props.mode === "bill" && <TableCell align="center" className="no-print">Must keep</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {railway.lines.map((l) => {
                  const a = aws.lines.find((x) => x.componentId === l.componentId);
                  const isOpen = open === l.componentId;
                  const rw = l.outcome === "disappears" ? "not needed" : l.outcome === "no-equivalent" || l.outcome === "kept" ? "stays on AWS" : l.notes.split(".")[0];
                  return (
                    <Fragment key={l.componentId}>
                      <TableRow hover onClick={() => setOpen(isOpen ? null : l.componentId)} aria-expanded={isOpen}
                        sx={{ cursor: "pointer", opacity: open && !isOpen ? 0.4 : 1, transition: "opacity .2s ease-out", bgcolor: isOpen ? wash : undefined, "& > td": isOpen ? { borderBottom: 0 } : {} }}>
                        <TableCell><Box sx={{ display: "flex", alignItems: "center", gap: 1, fontWeight: 600 }}><Mark outcome={l.outcome} />{l.label}</Box></TableCell>
                        <TableCell sx={{ color: muted }}>{rw}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: l.outcome === "disappears" ? red : ink }}>{l.outcome === "disappears" ? "$0" : range(l.destination)}</TableCell>
                        <TableCell sx={{ color: muted }}>{a?.uses}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>{a ? range(a.cost) : "—"}</TableCell>
                        {props.mode === "bill" && (
                          <TableCell align="center" className="no-print" onClick={(e) => e.stopPropagation()}>
                            {l.outcome === "moves" || l.outcome === "kept" ? <Checkbox size="small" checked={l.outcome === "kept"} onChange={() => setMustKeep((k) => (k.includes(l.componentId) ? k.filter((x) => x !== l.componentId) : [...k, l.componentId]))} slotProps={{ input: { "aria-label": `Keep ${l.label} on AWS` } }} /> : "—"}
                          </TableCell>
                        )}
                      </TableRow>
                      {isOpen && (
                        <TableRow sx={{ bgcolor: wash }}>
                          <TableCell colSpan={props.mode === "bill" ? 6 : 5} sx={{ pt: 0, pb: 2.5 }}>
                            <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: { xs: "1fr", md: "120px 1fr" }, rowGap: 1, columnGap: 3, "& dt": { ...label, color: muted, pt: "2px" }, "& dd": { m: 0, ...figures } }}>
                              <dt>Railway</dt><dd>{l.formula}{l.outcome === "moves" ? ` = ${range(l.destination)}/mo` : ""}. {l.notes}</dd>
                              {a && <><dt>AWS</dt><dd>{a.formula}{a.alternative ? `. ${a.alternative}` : ""}</dd></>}
                            </Box>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
                {aws.overhead.map((o) => (
                  <TableRow key={o.label}>
                    <TableCell><Box sx={{ display: "flex", alignItems: "center", gap: 1, fontWeight: 600 }}><Mark outcome="disappears" />{o.label}</Box></TableCell>
                    <TableCell sx={{ color: muted }}>not needed</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: red }}>$0</TableCell>
                    <TableCell sx={{ color: muted }}>{o.formula}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{range(o.cost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>

          {railway.notPriced.length > 0 && (
            <Typography sx={{ mt: 2, color: muted, fontSize: 14 }}>
              Not priced on either side: {railway.notPriced.map((n) => `${n.service || n.description} (${usd(n.cost)})`).join(", ")}.
            </Typography>
          )}

          <Box component="footer" sx={{ mt: 5, pt: 2, borderTop: `1px solid ${ink}`, color: muted, fontSize: 13, display: "grid", gap: 0.75, maxWidth: "80ch" }}>
            <span>Railway rates from railway.com/pricing, fetched {railwayPriceBook.fetched}. AWS rates: {awsPriceBook.region} on-demand, <strong>not yet verified against AWS's pages</strong>.</span>
            <span>SwitchYard is independent and not affiliated with Railway or Amazon Web Services.</span>
          </Box>
        </Box>
      </Box>
    </>
  );
}

function Cell({ head, value, note, accent, last }: { head: string; value: string; note: string; accent?: string; last?: boolean }) {
  return (
    <Box sx={{ p: 2.5, borderRight: { sm: last ? 0 : `1px solid ${rule}` }, borderTop: { xs: `1px solid ${rule}`, sm: 0 }, "&:first-of-type": { borderTop: 0 } }}>
      <Typography sx={{ ...label }}>{head}</Typography>
      <Typography sx={{ ...figures, ...condensed, textTransform: "none", fontStretch: "85%", fontSize: { xs: 30, md: 34 }, lineHeight: 1.1, mt: 0.75, color: accent ?? ink }}>{value}</Typography>
      <Typography sx={{ fontSize: 14, color: muted, mt: 0.5 }}>{note}</Typography>
    </Box>
  );
}

function Field({ label: l, children }: { label: string; children: ReactNode }) {
  return <Box sx={{ display: "grid", gap: 0.5 }}><Typography sx={{ ...label }}>{l}</Typography>{children}</Box>;
}

/** Each number: its label, unit, and the steps its slider moves through (rough, roughly logarithmic). */
const NUMBERS: Record<NumberKey, { label: string; unit: string; steps: number[] }> = {
  requestsPerDay: { label: "Requests a day", unit: "", steps: [100, 1e3, 5e3, 1e4, 5e4, 1e5, 2.5e5, 5e5, 1e6, 2.5e6, 5e6, 1e7] },
  kbPerRequest: { label: "Response size", unit: "KB", steps: [1, 2, 5, 10, 20, 50, 100, 200, 500] },
  dataGb: { label: "Database size", unit: "GB", steps: [0.1, 0.5, 1, 2, 5, 10, 20, 50, 100, 250, 500, 1000] },
  filesGb: { label: "Stored files", unit: "GB", steps: [0, 1, 5, 10, 20, 50, 100, 250, 500, 1000, 2500, 5000] },
  emailsPerDay: { label: "Emails a day", unit: "", steps: [0, 10, 50, 100, 500, 1e3, 5e3, 1e4, 5e4, 1e5] },
  smsPerDay: { label: "Texts a day", unit: "", steps: [0, 10, 50, 100, 500, 1e3, 5e3, 1e4, 5e4, 1e5] },
  concurrentConnections: { label: "Connected at once", unit: "", steps: [0, 10, 50, 100, 500, 1e3, 5e3, 1e4, 5e4] },
  monthlyActiveUsers: { label: "Monthly active users", unit: "", steps: [0, 100, 500, 1e3, 5e3, 1e4, 5e4, 1e5, 5e5, 1e6] },
};
const nearest = (steps: number[], v: number) => steps.reduce((best, s, i) => (Math.abs(Math.log1p(s) - Math.log1p(v)) < Math.abs(Math.log1p(steps[best]!) - Math.log1p(v)) ? i : best), 0);
const compact = (n: number) => n.toLocaleString("en-US", { notation: n >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 });

/** Guessed numbers first, flagged, each with a slider over sensible steps and an exact field. Any edit confirms it. */
function NumbersBlock({ design, setDesign }: { design: Design; setDesign: (d: Design) => void }) {
  const keys = relevantNumbers(design.parts);
  const guessed = keys.filter((k) => design.guessed?.includes(k));
  const ordered = [...guessed, ...keys.filter((k) => !guessed.includes(k))];
  const set = (k: NumberKey, v: number) => setDesign({ ...design, assumptions: { ...design.assumptions, [k]: Math.max(0, v) }, guessed: (design.guessed ?? []).filter((g) => g !== k) });
  if (!keys.length) return null;
  return (
    <Box component="section" aria-labelledby="numbers" sx={{ mt: 2.5, p: 2, bgcolor: "#fff", border: `${guessed.length ? 2 : 1}px solid ${guessed.length ? red : rule}` }}>
      <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Typography id="numbers" sx={{ ...label, color: guessed.length ? red : ink }}>{guessed.length ? `We guessed ${guessed.length} number${guessed.length > 1 ? "s" : ""}. Check them` : "Your numbers"}</Typography>
        {guessed.length > 0 && <Button variant="text" onClick={() => setDesign({ ...design, guessed: (design.guessed ?? []).filter((g) => !keys.includes(g as NumberKey)) })} sx={{ p: 0, minWidth: 0, color: ink, textDecoration: "underline", textUnderlineOffset: 3 }}>These look right</Button>}
      </Box>
      <Box sx={{ display: "grid", gap: 1.5, mt: 1.5 }}>
        {ordered.map((k) => {
          const n = NUMBERS[k], v = design.assumptions[k], isGuess = guessed.includes(k);
          return (
            <Box key={k} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "150px 1fr 110px" }, alignItems: "center", columnGap: 2 }}>
              <Typography sx={{ fontWeight: 600, fontSize: 14 }}>
                {n.label}{isGuess && <Typography component="span" sx={{ ml: 1, fontSize: 11, fontWeight: 700, color: red, textTransform: "uppercase", letterSpacing: ".06em" }}>guessed</Typography>}
              </Typography>
              <Slider value={nearest(n.steps, v)} min={0} max={n.steps.length - 1} step={1} marks onChange={(_, i) => set(k, n.steps[i as number]!)}
                getAriaValueText={(i) => `${compact(n.steps[i]!)} ${n.unit}`} slotProps={{ input: { "aria-label": n.label } }}
                sx={{ color: isGuess ? red : ink, "& .MuiSlider-thumb": { width: 14, height: 14, borderRadius: 0 }, "& .MuiSlider-mark": { height: 6, width: 1 } }} />
              <TextField size="small" type="number" value={v} onChange={(e) => set(k, Number(e.target.value) || 0)}
                slotProps={{ htmlInput: { min: 0, "aria-label": `${n.label} exact` }, input: { endAdornment: n.unit ? <Typography sx={{ fontSize: 13, color: muted, ml: 0.5 }}>{n.unit}</Typography> : undefined } }} />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
const SHAPES: [TrafficShape, string][] = [["steady", "Steady"], ["business-hours", "Business hours"], ["spiky", "Spiky"], ["mostly-idle", "Mostly idle"]];

function DesignPanel({ design, setDesign }: { design: Design; setDesign: (d: Design) => void }) {
  const a = design.assumptions;
  const setA = (patch: Partial<Design["assumptions"]>) => setDesign({ ...design, assumptions: { ...a, ...patch } });
  const setPart = (i: number, patch: Partial<Design["parts"][number]>) => setDesign({ ...design, parts: design.parts.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  const answer = (qi: number, value: string | number) => {
    const q = design.questions![qi]!;
    let next: Design = { ...design, questions: design.questions!.map((x, j) => (j === qi ? { ...x, answer: value } : x)) };
    const a2 = { ...next.assumptions };
    const confirm = (k: string) => (next = { ...next, guessed: (next.guessed ?? []).filter((g) => g !== k) });
    if (q.topic === "traffic-volume") a2.requestsPerDay = Number(value), confirm("requestsPerDay");
    if (q.topic === "traffic-shape") a2.trafficShape = value as TrafficShape;
    if (q.topic === "data-size") a2.dataGb = Number(value), confirm("dataGb");
    if (q.topic === "active-users") a2.monthlyActiveUsers = Number(value), confirm("monthlyActiveUsers");
    if (q.topic === "messaging-volume") a2.emailsPerDay = Number(value), confirm("emailsPerDay");
    const ensure = (types: PartType[], on: boolean) => {
      let parts = next.parts.map((p) => (types.includes(p.type) ? { ...p, on } : p));
      if (on) for (const t of types) if (!parts.some((p) => p.type === t)) parts = [...parts, { type: t, tier: "small" as Tier, why: "you said yes", on: true }];
      next = { ...next, parts };
    };
    if (q.topic === "background-work") ensure(["background-worker", "queue"], value === "yes");
    if (q.topic === "search-needed") ensure(["search"], value === "yes");
    if (q.topic === "file-uploads") { ensure(["object-storage"], value === "yes"); if (value === "yes" && !a2.filesGb) a2.filesGb = 20; }
    setDesign({ ...next, assumptions: a2 });
  };

  return (
    <>
      {design.idea && <Typography sx={{ mt: 1.5, p: 1.5, bgcolor: "#fff", border: `1px solid ${ink}`, fontSize: 15 }}>{design.idea}</Typography>}
      {design.panelNote && <Typography sx={{ mt: 1, fontSize: 13, color: muted }}>{design.panelNote}</Typography>}

      {!!design.questions?.length && (
        <Box sx={{ mt: 2.5, display: "grid", gap: 2, p: 2, bgcolor: "#fff", border: `2px solid ${red}` }}>
          <Typography sx={{ ...label, color: red }}>The models asked</Typography>
          {design.questions.map((q, i) => (
            <Field key={q.topic} label={q.text}>
              <ToggleButtonGroup size="small" exclusive value={q.answer ?? null} onChange={(_, v) => v !== null && answer(i, v)} sx={{ flexWrap: "wrap" }}>
                {TOPIC_OPTIONS[q.topic].map((o) => <ToggleButton key={String(o.value)} value={o.value}>{o.label}</ToggleButton>)}
              </ToggleButtonGroup>
            </Field>
          ))}
        </Box>
      )}

      <Box sx={{ mt: 2.5, display: "grid", gap: 2 }}>
        <Field label="When is traffic busiest?">
          <ToggleButtonGroup size="small" exclusive value={a.trafficShape} onChange={(_, v) => v && setA({ trafficShape: v })} sx={{ bgcolor: "#fff", flexWrap: "wrap" }}>
            {SHAPES.map(([v, t]) => <ToggleButton key={v} value={v}>{t}</ToggleButton>)}
          </ToggleButtonGroup>
        </Field>
      </Box>

      <NumbersBlock design={design} setDesign={setDesign} />

      <Typography component="h3" sx={{ ...condensed, fontSize: 16, mt: 3, mb: 0.5 }}>Parts</Typography>
      <Box sx={{ borderTop: `2px solid ${ink}` }}>
        {design.parts.map((p, i) => (
          <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1, borderBottom: `1px solid ${rule}` }}>
            <Checkbox size="small" checked={p.on} onChange={() => setPart(i, { on: !p.on })} slotProps={{ input: { "aria-label": `Include ${PART_LABEL[p.type]}` } }} sx={{ p: 0.5 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, color: p.on ? ink : muted }}>{PART_LABEL[p.type]}</Typography>
              <Typography sx={{ fontSize: 13, color: muted }}>{p.why}</Typography>
            </Box>
            {isSized(p.type) && (
              <Select size="small" value={p.tier} onChange={(e) => setPart(i, { tier: e.target.value as Tier })} inputProps={{ "aria-label": `${PART_LABEL[p.type]} size` }} sx={{ bgcolor: "#fff", minWidth: 100 }}>
                <MenuItem value="small">small</MenuItem><MenuItem value="medium">medium</MenuItem><MenuItem value="large">large</MenuItem>
              </Select>
            )}
            {p.agreement && <Typography sx={{ border: `1px solid ${ink}`, px: 1, fontSize: 12, fontWeight: 600 }}>{p.agreement}</Typography>}
          </Box>
        ))}
      </Box>
      <Select size="small" displayEmpty value="" onChange={(e) => e.target.value && setDesign({ ...design, parts: [...design.parts, { type: e.target.value as PartType, tier: "small", why: "added by you", on: true }] })}
        inputProps={{ "aria-label": "Add a part" }} sx={{ mt: 1.5, bgcolor: "#fff", minWidth: 200 }}>
        <MenuItem value="" disabled>Add a part…</MenuItem>
        {PART_TYPES.map((t) => <MenuItem key={t} value={t}>{PART_LABEL[t]}</MenuItem>)}
      </Select>
    </>
  );
}
