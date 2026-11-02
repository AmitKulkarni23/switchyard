import { expect, test } from "bun:test";
import { createDesign, slidingWindow } from "../backend/api";
import { compareDrafts, mergeDrafts } from "../backend/design/consensus";
import { DesignDraft } from "../backend/design/draft";
import { openRouterCaller, userMessage } from "../backend/design/openrouter";
import { type Caller, draftDesign } from "../backend/design/panel";

const n = (value: number, assumed = true) => ({ value, assumed });
const draft = (over: Partial<DesignDraft> = {}): DesignDraft => DesignDraft.parse({
  parts: [{ type: "web-service", tier: "small", why: "booking site" }, { type: "relational-db", tier: "small", why: "appointments" }, { type: "scheduled-job", tier: "small", why: "reminders" }],
  trafficShape: "business-hours",
  assumptions: { requestsPerDay: n(100000), kbPerRequest: n(50), dataGb: n(2), filesGb: n(0), emailsPerDay: n(0), smsPerDay: n(0), concurrentConnections: n(0), monthlyActiveUsers: n(5000) },
  questions: ["traffic-volume"],
  ...over,
});
const panel = { primary: ["glm", "deepseek"], tiebreak: "sol" };
const fake = (answers: Record<string, DesignDraft | Error>): { call: Caller; calls: string[] } => {
  const calls: string[] = [];
  return { calls, call: async (model) => { calls.push(model); const a = answers[model]!; if (a instanceof Error) throw a; return a; } };
};

test("free text and numbers never count as disagreement", () => {
  const b = draft({ parts: draft().parts.map((p) => ({ ...p, why: "different words" })), assumptions: { ...draft().assumptions, requestsPerDay: n(900000), kbPerRequest: n(5), dataGb: n(300), filesGb: n(0.2) } });
  expect(compareDrafts(draft(), b)).toEqual({ agree: true, disputes: [] });
});

test("material differences are disputes", () => {
  const b = draft({ parts: [...draft().parts, { type: "queue", tier: "small", why: "async" }], trafficShape: "steady" });
  expect(compareDrafts(draft(), b).disputes).toEqual(["part queue", "traffic shape"]);
});

test("agreeing pair never calls the tie-breaker", async () => {
  const { call, calls } = fake({ glm: draft(), deepseek: draft() });
  const r = await draftDesign({ idea: "x" }, call, panel);
  expect(calls.sort()).toEqual(["deepseek", "glm"]);
  expect(r.escalated).toBe(false);
  expect(r.parts.every((p) => p.on && p.agreement === "2/2")).toBe(true);
});

test("disagreement escalates and the majority wins per field", async () => {
  const withQueue = draft({ parts: [...draft().parts, { type: "queue", tier: "small", why: "async" }], trafficShape: "steady" });
  const { call, calls } = fake({ glm: draft(), deepseek: withQueue, sol: draft() });
  const r = await draftDesign({ idea: "x" }, call, panel);
  expect(calls).toContain("sol");
  expect(r.escalated).toBe(true);
  expect(r.disputes).toEqual(["part queue", "traffic shape"]);
  expect(r.parts.find((p) => p.type === "queue")).toMatchObject({ on: false, agreement: "1/3" });
  expect(r.parts.find((p) => p.type === "web-service")).toMatchObject({ on: true, agreement: "3/3" });
  expect(r.trafficShape).toBe("business-hours");
});

test("a failed cheap model escalates; two failures is an error", async () => {
  const one = fake({ glm: draft(), deepseek: new Error("timeout"), sol: draft() });
  const r = await draftDesign({ idea: "x" }, one.call, panel);
  expect(r.models.map((m) => m.ok)).toEqual([true, false, true]);
  expect(r.parts.every((p) => p.agreement === "2/2")).toBe(true);
  const two = fake({ glm: new Error("x"), deepseek: new Error("y"), sol: draft() });
  await expect(draftDesign({ idea: "x" }, two.call, panel)).rejects.toThrow(/Only 1 of 3 models answered/);
});

test("median numbers and top questions", () => {
  const m = mergeDrafts([draft(), draft({ assumptions: { ...draft().assumptions, requestsPerDay: n(300000, false) } }), draft({ assumptions: { ...draft().assumptions, requestsPerDay: n(200000) } })]);
  expect(m.assumptions.requestsPerDay).toBe(200000);
  expect(m.questions).toEqual([{ topic: "traffic-volume", text: "Roughly how many requests a day (page loads and API calls)?" }]);
});

test("OpenRouter caller sends strict schema, only the idea, and retries invalid output once", async () => {
  const bodies: any[] = [];
  let n = 0;
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(init.body as string));
    const content = n++ === 0 ? "{not json" : JSON.stringify(draft());
    return Response.json({ choices: [{ message: { content } }] });
  }) as unknown as typeof fetch;
  const d = await openRouterCaller("key", fetchImpl)("z-ai/glm-5.3", { idea: "A booking app", dataGb: 2 });
  expect(d.parts).toHaveLength(3);
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toMatchObject({ model: "z-ai/glm-5.3", temperature: 0, reasoning: { effort: "low" }, response_format: { type: "json_schema", json_schema: { strict: true } } });
  expect(bodies[0].messages[1].content).toBe(userMessage({ idea: "A booking app", dataGb: 2 }));
  expect(bodies[1].messages.at(-1).content).toMatch(/did not match the schema/);
});

test("POST /api/designs: 503 without a key, 400 on short ideas, cache hit skips models, 429 on limit", async () => {
  const req = (body: unknown) => new Request("http://x/api/designs", { method: "POST", body: JSON.stringify(body) });
  const idea = "A booking app for dental clinics with reminders the day before.";
  expect((await createDesign(req({ idea }), "ip", {})).status).toBe(503);
  const { call, calls } = fake({ "z-ai/glm-5.3": draft(), "deepseek/deepseek-v4-flash": draft() });
  expect((await createDesign(req({ idea: "too short" }), "ip", { caller: call })).status).toBe(400);
  const cache = new Map<string, unknown>();
  const store = { save: async () => "", load: async () => undefined, getDraft: async (k: string) => cache.get(k), saveDraft: async (k: string, v: unknown) => void cache.set(k, v) };
  const first = await createDesign(req({ idea }), "ip", { caller: call, store });
  expect(first.status).toBe(200);
  expect(calls).toHaveLength(2);
  const second = await createDesign(req({ idea }), "ip", { caller: call, store });
  expect((await second.json()).cached).toBe(true);
  expect(calls).toHaveLength(2);
  const limit = slidingWindow(1, 60_000);
  expect((await createDesign(req({ idea: idea + " Two." }), "ip2", { caller: call, rateLimit: limit })).status).toBe(200);
  expect((await createDesign(req({ idea: idea + " Three." }), "ip2", { caller: call, rateLimit: limit })).status).toBe(429);
});

test("a model that rejects temperature or reasoning settings is retried without them", async () => {
  const bodies: any[] = [];
  const fetchImpl = (async (_u: string, init: RequestInit) => {
    const b = JSON.parse(init.body as string);
    bodies.push(b);
    return "temperature" in b ? Response.json({ error: { message: "No endpoints found" } }, { status: 404 }) : Response.json({ choices: [{ message: { content: JSON.stringify(draft()) } }] });
  }) as unknown as typeof fetch;
  await openRouterCaller("k", fetchImpl)("openai/gpt-6.1-sol", { idea: "x" });
  expect(bodies.map((b) => "temperature" in b || "reasoning" in b)).toEqual([true, false]);
});

test("merged parts keep the models' order", () => {
  expect(mergeDrafts([draft(), draft()]).parts.map((p) => p.type)).toEqual(["web-service", "relational-db", "scheduled-job"]);
});

test("every worked example in rules.md matches the strict schema", async () => {
  const rules = await Bun.file(`${import.meta.dir}/../backend/design/rules.md`).text();
  const examples = rules.split("\n").filter((l) => l.startsWith('{"parts"'));
  expect(examples.length).toBe(3);
  for (const e of examples) expect(() => DesignDraft.parse(JSON.parse(e))).not.toThrow();
});

test("new parts price on both sides", async () => {
  const { designToWorkload, DEFAULT_ASSUMPTIONS } = await import("../backend/design/parts");
  const { compareBoth } = await import("../backend/compare");
  const types = ["web-service", "relational-db", "search", "stream", "messaging", "cdn", "realtime", "auth"] as const;
  const w = designToWorkload({ idea: "", parts: types.map((type) => ({ type, tier: "small", why: "", on: true })), assumptions: { ...DEFAULT_ASSUMPTIONS, emailsPerDay: 1000, smsPerDay: 100, monthlyActiveUsers: 20000 } });
  const { railway, aws } = compareBoth(w);
  const rw = (label: string) => railway.lines.find((l) => l.label === label)!;
  const a = (label: string) => aws.lines.find((l) => l.label === label)!;
  // email and SMS go through an external sender: the same cost on both sides (1000 × 30 × $0.10/1000 + 100 × 30 × $0.00645)
  expect(rw("Email and SMS").destination.low).toBeCloseTo(3 + 19.35, 2);
  expect(a("Email and SMS").cost.low).toBeCloseTo(3 + 19.35, 2);
  expect(a("User sign-in").cost.low).toBeCloseTo(10000 * 0.015, 2); // 20k MAU, 10k free
  expect(rw("User sign-in").destination.low).toBe(0);
  expect(a("Search").uses).toBe("OpenSearch Service t3.small.search");
  expect(a("Event stream").uses).toBe("Kinesis Data Streams (1 shard)");
  expect(a("Web service").formula).not.toMatch(/egress/); // behind the CDN, origin egress is free
  expect(aws.overhead.map((o) => o.label)).toEqual(["NAT gateway"]);
});

test("questions the design already answers are dropped; wording comes from code", () => {
  const withPhotos = draft({ parts: [...draft().parts, { type: "object-storage", tier: "small", why: "photos" }], questions: ["file-uploads", "data-size", "traffic-volume"] });
  const m = mergeDrafts([withPhotos, withPhotos]);
  expect(m.questions.map((q) => q.topic)).toEqual(["data-size", "traffic-volume"]);
  expect(new Set(m.questions.map((q) => q.text)).size).toBe(2);
});
