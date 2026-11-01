import { Fragment, type ReactNode, useMemo, useState } from "react";
import { Box, Button, Checkbox, Slider, Table, TableBody, TableCell, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { compare } from "../backend/compare";
import { railwayPriceBook } from "../backend/data/price-books";
import { MEMORY_FLOOR } from "../backend/pricers/railway";
import type { Estimate, EstimateLine, UnpricedLine, Workload } from "../backend/schema";
import { condensed, figures, ink, label, muted, red, rule, wash } from "./theme";

// ---------- formatting: whole dollars; cents would be false precision on an estimate ----------
const usd = (n: number) => (Math.abs(n) < 1 && n !== 0 ? "<$1" : `$${Math.round(Math.abs(n)).toLocaleString("en-US")}`);
const range = (r: { low: number; high: number }) => (Math.round(r.low) === Math.round(r.high) ? usd(r.low) : `${usd(r.low)} – ${usd(r.high)}`);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const sum = (xs: { cost: number }[]) => xs.reduce((s, x) => s + x.cost, 0);

// ---------- outcome marks: the chart's rating vocabulary ----------
export type Outcome = EstimateLine["outcome"] | "not-priced";
export const OUTCOME_LABEL: Record<Outcome, string> = { moves: "Moves", disappears: "Disappears", "no-equivalent": "No equivalent", kept: "Kept on AWS", "not-priced": "Not priced" };

export function Mark({ outcome }: { outcome: Outcome }) {
  const fill = { moves: ink, disappears: red, "no-equivalent": "#fff", kept: "#fff", "not-priced": `linear-gradient(90deg, ${ink} 50%, #fff 50%)` }[outcome];
  return (
    <Box component="span" aria-hidden sx={{ display: "inline-block", flex: "none", width: 14, height: 14, borderRadius: "50%", border: `2px solid ${outcome === "disappears" ? red : ink}`, background: fill, position: "relative", verticalAlign: "-2px",
      ...(outcome === "kept" && { "&::after": { content: '""', position: "absolute", inset: 3, borderRadius: "50%", background: ink } }) }} />
  );
}

export function Masthead({ children }: { children?: ReactNode }) {
  return (
    <Box component="header" sx={{ bgcolor: red, color: "#fff", px: { xs: 2, md: 5 }, py: 1.5, minHeight: 60, display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 3, rowGap: 1 }}>
      <Box component="a" href="/" sx={{ ...condensed, fontSize: 24, color: "#fff", textDecoration: "none" }}>SwitchYard</Box>
      {children}
    </Box>
  );
}

// ---------- results ----------
type Props = { workload: Workload; id: string | null; fileName: string; sample: boolean; onReset: () => void };
type Filter = "all" | "moves" | "disappears" | "stays";

export function Results({ workload, id, fileName, sample, onReset }: Props) {
  const [busy, setBusy] = useState<number[]>([10, 50]);
  const [mustKeep, setMustKeep] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [copied, setCopied] = useState(false);

  const utilization = { low: busy[0]! / 100, high: busy[1]! / 100 };
  // Same compare() the server runs: every slider move and toggle recomputes here, no API call.
  const e: Estimate = useMemo(() => compare(workload, { utilization, mustKeep }), [workload, busy, mustKeep]);
  const byId = new Map(workload.components.map((c) => [c.id, c]));

  const shown = e.lines.filter((l) => filter === "all" || (filter === "stays" ? l.outcome === "no-equivalent" || l.outcome === "kept" : l.outcome === filter));
  const count = (o: Outcome) => e.lines.filter((l) => l.outcome === o).length;
  const toggleKeep = (cid: string) => setMustKeep((k) => (k.includes(cid) ? k.filter((x) => x !== cid) : [...k, cid]));

  const share = async () => {
    if (!id) return;
    await navigator.clipboard.writeText(`${location.origin}/?e=${id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const period = workload.periodStart ? new Date(workload.periodStart).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : null;
  const source = [fileName, sample && "sample bill (synthetic)", period, `${workload.components.length} components`].filter(Boolean).join(" · ");

  return (
    <>
      <Masthead>
        <Typography sx={{ fontSize: 14, opacity: 0.95, minWidth: 0, overflowWrap: "anywhere" }}>{source}</Typography>
        <Box className="no-print" sx={{ ml: { md: "auto" }, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Typography component="label" id="busy-label" sx={{ fontSize: 14, whiteSpace: "nowrap" }}>How busy are your servers?</Typography>
            <Slider aria-labelledby="busy-label" value={busy} onChange={(_, v) => setBusy(v as number[])} min={0} max={100} step={5} disableSwap
              getAriaValueText={(v) => `${v}% busy`} valueLabelDisplay="auto" valueLabelFormat={(v) => `${v}%`}
              sx={{ width: 160, color: "#fff", "& .MuiSlider-thumb": { width: 16, height: 16, borderRadius: 0 }, "& .MuiSlider-rail": { opacity: 0.5 }, "& .MuiSlider-valueLabel": { bgcolor: ink, borderRadius: 0 } }} />
            <Typography sx={{ ...figures, fontWeight: 700, fontSize: 14, minWidth: 64 }}>{busy[0] === busy[1] ? `${busy[0]}%` : `${busy[0]}–${busy[1]}%`}</Typography>
          </Box>
          <Button variant="outlined" onClick={() => print()} sx={{ color: "#fff", borderColor: "#fff", "&:hover": { borderColor: "#fff", bgcolor: "rgba(255,255,255,.12)" } }}>Export PDF</Button>
          <Button variant="contained" onClick={share} disabled={!id} title={id ? undefined : "Share links are off on this deployment"}
            sx={{ bgcolor: "#fff", color: red, "&:hover": { bgcolor: "#fff" }, "&.Mui-disabled": { bgcolor: "rgba(255,255,255,.6)", color: red } }}>
            {copied ? "Link copied" : "Share link"}
          </Button>
        </Box>
      </Masthead>

      <Box component="main" sx={{ px: { xs: 2, md: 5 }, pb: 8, maxWidth: 1440, mx: "auto" }}>
        <Verdict e={e} utilization={utilization} />

        <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 2, mt: 5, mb: 1.5 }}>
          <Typography component="h2" sx={{ ...condensed, fontSize: 20 }}>Ratings by component</Typography>
          <ToggleButtonGroup className="no-print" size="small" exclusive value={filter} onChange={(_, v) => v && setFilter(v)} aria-label="Filter by outcome">
            <ToggleButton value="all">All {e.lines.length}</ToggleButton>
            <ToggleButton value="moves">Moves {count("moves")}</ToggleButton>
            <ToggleButton value="disappears">Disappears {count("disappears")}</ToggleButton>
            <ToggleButton value="stays">Stays on AWS {count("no-equivalent") + count("kept")}</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Box sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: { md: 900 } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 40 }}>#</TableCell>
                <TableCell>Component</TableCell>
                <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>On the AWS bill</TableCell>
                <TableCell>Outcome</TableCell>
                <TableCell align="right">AWS /mo</TableCell>
                <TableCell align="right">Railway /mo</TableCell>
                <TableCell align="center" className="no-print" sx={{ width: 96 }}>Must keep</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((l) => {
                const c = byId.get(l.componentId)!;
                const isOpen = open === l.componentId;
                const dim = open !== null && !isOpen;
                const keepable = l.outcome === "moves" || l.outcome === "kept";
                return (
                  <Fragment key={l.componentId}>
                    <TableRow hover onClick={() => setOpen(isOpen ? null : l.componentId)} aria-expanded={isOpen}
                      sx={{ cursor: "pointer", opacity: dim ? 0.4 : 1, transition: "opacity .2s ease-out", bgcolor: isOpen ? wash : undefined, "& > td": isOpen ? { borderBottom: 0 } : {} }}>
                      <TableCell sx={{ color: muted }}>{l.componentId}</TableCell>
                      <TableCell>
                        <Button variant="text" disableFocusRipple onClick={(ev) => (ev.stopPropagation(), setOpen(isOpen ? null : l.componentId))}
                          aria-label={`${isOpen ? "Hide" : "Show"} the math for ${l.label}`}
                          sx={{ p: 0, minWidth: 0, color: ink, fontWeight: 600, textAlign: "left", "&:hover": { bgcolor: "transparent", textDecoration: "underline" } }}>
                          {l.label}
                        </Button>
                        <Typography sx={{ display: { md: "none" }, fontSize: 13, color: muted }}>{c.sourceService}</Typography>
                      </TableCell>
                      <TableCell sx={{ display: { xs: "none", md: "table-cell" }, color: muted }}>{c.sourceService}{c.detail && ` · ${c.detail}`}</TableCell>
                      <TableCell><Box sx={{ display: "flex", alignItems: "center", gap: 1 }}><Mark outcome={l.outcome} />{OUTCOME_LABEL[l.outcome]}</Box></TableCell>
                      <TableCell align="right">{usd(l.current)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, color: l.outcome === "disappears" ? red : ink }}>{l.outcome === "disappears" ? "$0" : range(l.destination)}</TableCell>
                      <TableCell align="center" className="no-print" onClick={(ev) => ev.stopPropagation()}>
                        {keepable ? <Checkbox size="small" checked={l.outcome === "kept"} onChange={() => toggleKeep(l.componentId)} slotProps={{ input: { "aria-label": `Keep ${l.label} on AWS` } }} />
                          : <Typography component="span" sx={{ color: muted }} aria-label="Not applicable">—</Typography>}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow sx={{ bgcolor: wash }}>
                        <TableCell />
                        <TableCell colSpan={6} sx={{ pt: 0, pb: 2.5 }}>
                          <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: { xs: "1fr", md: "160px 1fr" }, rowGap: 1, columnGap: 3, "& dt": { ...label, color: muted, pt: "2px" }, "& dd": { m: 0 } }}>
                            <dt>On the bill</dt><dd>{c.sourceService}{c.detail && ` · ${c.detail}`} · {c.rowCount} bill line{c.rowCount === 1 ? "" : "s"} · {usd(c.currentMonthlyCost)}/mo</dd>
                            <dt>The math</dt><dd style={{ fontVariantNumeric: "tabular-nums" }}>{l.formula}{l.outcome === "moves" && ` = ${range(l.destination)}/mo`}</dd>
                            <dt>Note</dt><dd>{l.notes}</dd>
                            {c.warnings.map((w) => (<Fragment key={w}><dt>Check</dt><dd>{w}</dd></Fragment>))}
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Box>

        <Leftovers title="Not priced" note="Lines we couldn't map to a Railway equivalent. They're left out of both totals." rows={e.notPriced} />
        <Leftovers title="Left out of the comparison" note="Tax and credits depend on your account, not the workload." rows={e.excluded} />

        <Box component="footer" sx={{ mt: 6, pt: 2, borderTop: `1px solid ${ink}`, display: "grid", gap: 1, color: muted, fontSize: 13, maxWidth: "75ch" }}>
          <span>
            Railway rates from {railwayPriceBook.sources.map((s, i) => (<Fragment key={s}>{i > 0 && " and "}<a href={s} target="_blank" rel="noreferrer">{new URL(s).hostname + new URL(s).pathname.replace(/\/$/, "")}</a></Fragment>))}, fetched {railwayPriceBook.fetched}.
            The bill shows what you provisioned, not what you used, so CPU is priced at {pct(utilization.low)}–{pct(utilization.high)} busy and memory at {pct(MEMORY_FLOOR + (1 - MEMORY_FLOOR) * utilization.low)}–{pct(MEMORY_FLOOR + (1 - MEMORY_FLOOR) * utilization.high)} used.
          </span>
          <span>SwitchYard is independent and not affiliated with Railway or Amazon Web Services.</span>
          <Box className="no-print"><Button variant="text" onClick={onReset} sx={{ p: 0, minWidth: 0, color: ink, textDecoration: "underline", textUnderlineOffset: 3 }}>Price another bill</Button></Box>
        </Box>
      </Box>
    </>
  );
}

function Verdict({ e, utilization }: { e: Estimate; utilization: { low: number; high: number } }) {
  const n = (o: EstimateLine["outcome"]) => e.lines.filter((l) => l.outcome === o);
  const moves = n("moves"), gone = n("disappears"), none = n("no-equivalent"), kept = n("kept");
  const d = e.difference;
  const diffHead = d.low >= 0 ? `${range(d)}` : d.high <= 0 ? `${range({ low: -d.high, high: -d.low })}` : `${usd(-d.low)} more to ${usd(d.high)} less`;
  const diffNote = d.low >= 0 ? "less per month on Railway" : d.high <= 0 ? "more per month on Railway" : "per month, depending on how busy you are";
  const parts = [
    `${moves.length} component${moves.length === 1 ? "" : "s"} move.`,
    gone.length && `${gone.length} disappear, saving ${usd(gone.reduce((s, l) => s + l.current, 0))}.`,
    none.length && `${none.length} ${none.length === 1 ? "has" : "have"} no Railway equivalent and stay on AWS (${usd(none.reduce((s, l) => s + l.current, 0))}).`,
    kept.length && `${kept.length} kept on AWS by you.`,
    e.notPriced.length && `${e.notPriced.length} not priced (${usd(sum(e.notPriced))}).`,
  ].filter(Boolean);

  return (
    <Box component="section" aria-label="Verdict" sx={{ mt: { xs: 3, md: 4 }, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "1fr 1fr 1fr 1.4fr" }, borderBottom: `1px solid ${ink}`, position: "relative",
      "&::before": { content: '""', position: "absolute", inset: "0 0 auto 0", height: 4, bgcolor: ink, transformOrigin: "left", animation: "sy-rule .6s cubic-bezier(.16,1,.3,1) both" },
      "@keyframes sy-rule": { from: { transform: "scaleX(0)" }, to: { transform: "scaleX(1)" } } }}>
      <Cell head="AWS today" value={usd(e.current)} note="per month, priced lines only" />
      <Cell head="On Railway" value={range(e.destinationTotal)} note={`at ${pct(utilization.low)}–${pct(utilization.high)} busy · ${e.plan.name === "None" ? "nothing moves" : `${e.plan.name} plan, $${e.plan.monthlyFee}/mo incl. $${e.plan.includedUsage} usage`}`} />
      <Cell head="Difference" value={diffHead} note={diffNote} accent={d.high < 0 ? red : undefined} />
      <Box sx={{ p: { xs: 2, md: 2.5 }, pt: { xs: 2.5, md: 3 }, bgcolor: wash, borderTop: { xs: `1px solid ${rule}`, lg: 0 } }}>
        <Typography sx={{ ...label }}>The verdict</Typography>
        <Typography sx={{ mt: 1, fontSize: 15, lineHeight: 1.5 }}>{parts.join(" ")}</Typography>
      </Box>
    </Box>
  );
}

function Cell({ head, value, note, accent }: { head: string; value: string; note: string; accent?: string }) {
  return (
    <Box sx={{ p: { xs: 2, md: 2.5 }, pt: { xs: 2.5, md: 3 }, borderRight: { lg: `1px solid ${rule}` }, borderTop: { xs: `1px solid ${rule}`, lg: 0 }, "&:first-of-type": { borderTop: 0 } }}>
      <Typography sx={{ ...label }}>{head}</Typography>
      <Typography sx={{ ...figures, ...condensed, textTransform: "none", fontStretch: "85%", fontSize: { xs: 32, md: 36 }, lineHeight: 1.1, mt: 0.75, color: accent ?? ink }}>{value}</Typography>
      <Typography sx={{ fontSize: 14, color: muted, mt: 0.5 }}>{note}</Typography>
    </Box>
  );
}

function Leftovers({ title, note, rows }: { title: string; note: string; rows: UnpricedLine[] }) {
  if (!rows.length) return null;
  return (
    <Box component="section" sx={{ mt: 5 }}>
      <Typography component="h2" sx={{ ...condensed, fontSize: 18 }}>{title}</Typography>
      <Typography sx={{ color: muted, fontSize: 14, mb: 1 }}>{note}</Typography>
      <Table size="small" sx={{ maxWidth: 900 }}>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              <TableCell sx={{ width: 28 }}><Mark outcome="not-priced" /></TableCell>
              <TableCell>{r.service || r.description}<Typography component="span" sx={{ display: "block", fontSize: 13, color: muted }}>{r.service ? r.description : ""} {r.reason !== "tax" && r.reason !== "credit" ? `· ${r.reason}` : ""}</Typography></TableCell>
              <TableCell align="right" sx={{ width: 120 }}>{r.cost < 0 ? `−${usd(r.cost)}` : usd(r.cost)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
