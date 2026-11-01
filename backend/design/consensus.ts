import type { DesignDraft, QuestionTopic } from "./draft";
import { isSized, type Part, type PartType, type Tier, type TrafficShape } from "./parts";

const TIER_ORDER: Tier[] = ["small", "medium", "large"];
const SHAPE_ORDER: TrafficShape[] = ["business-hours", "steady", "spiky", "mostly-idle"]; // tie-break preference
const NUMBERS = ["requestsPerDay", "kbPerRequest", "dataGb", "filesGb"] as const;

/** One part per type per draft (first wins). ponytail: two parts of the same type collapse; count them if designs need it. */
const byType = (d: DesignDraft) => {
  const m = new Map<PartType, DesignDraft["parts"][number]>();
  for (const p of d.parts) if (!m.has(p.type)) m.set(p.type, p);
  return m;
};

/** Numbers agree within 2×; small values (< 1) agree with each other. */
const close = (a: number, b: number) => (a < 1 && b < 1) || (Math.min(a, b) > 0 && Math.max(a, b) / Math.min(a, b) <= 2);

/** Material agreement between two drafts. Free text (why, question wording) is never compared. */
export function compareDrafts(a: DesignDraft, b: DesignDraft): { agree: boolean; disputes: string[] } {
  const disputes: string[] = [];
  const pa = byType(a), pb = byType(b);
  for (const t of new Set([...pa.keys(), ...pb.keys()])) {
    if (!pa.has(t) || !pb.has(t)) disputes.push(`part ${t}`);
    else if (isSized(t) && pa.get(t)!.tier !== pb.get(t)!.tier) disputes.push(`size of ${t}`);
  }
  if (a.trafficShape !== b.trafficShape) disputes.push("traffic shape");
  for (const k of NUMBERS) if (!close(a.assumptions[k].value, b.assumptions[k].value)) disputes.push(k);
  return { agree: disputes.length === 0, disputes };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
function mode<T>(xs: T[], order: T[]): T {
  const counts = new Map<T, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  const best = Math.max(...counts.values());
  return order.find((o) => counts.get(o) === best) ?? xs[0]!;
}

export type Merged = {
  parts: Part[];
  trafficShape: TrafficShape;
  assumptions: Record<(typeof NUMBERS)[number], number>;
  assumed: string[];
  questions: { topic: QuestionTopic; text: string }[];
};

/** Field-by-field vote across 2 or 3 drafts. A part needs a strict majority to be on; otherwise it's an unticked suggestion. */
export function mergeDrafts(drafts: DesignDraft[]): Merged {
  const n = drafts.length;
  const maps = drafts.map(byType);
  const types: PartType[] = [];
  for (const m of maps) for (const t of m.keys()) if (!types.includes(t)) types.push(t);

  const parts: Part[] = types.map((t) => {
    const having = maps.filter((m) => m.has(t)).map((m) => m.get(t)!);
    return { type: t, tier: mode(having.map((p) => p.tier), TIER_ORDER), why: having[0]!.why, agreement: `${having.length}/${n}`, on: having.length * 2 > n };
  });

  const topicCount = new Map<QuestionTopic, { n: number; text: string }>();
  for (const d of drafts) for (const q of new Map(d.questions.map((q) => [q.topic, q])).values()) {
    const cur = topicCount.get(q.topic);
    topicCount.set(q.topic, { n: (cur?.n ?? 0) + 1, text: cur?.text ?? q.text });
  }

  return {
    parts,
    trafficShape: mode(drafts.map((d) => d.trafficShape), SHAPE_ORDER),
    assumptions: Object.fromEntries(NUMBERS.map((k) => [k, median(drafts.map((d) => d.assumptions[k].value))])) as Merged["assumptions"],
    assumed: NUMBERS.filter((k) => drafts.some((d) => d.assumptions[k].assumed)),
    questions: [...topicCount].sort((a, b) => b[1].n - a[1].n).slice(0, 3).map(([topic, q]) => ({ topic, text: q.text })),
  };
}
