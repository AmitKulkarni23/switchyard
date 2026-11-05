import { expect, spyOn, test } from "bun:test";
import { clientIp, createDesign, limiter, slidingWindow } from "../backend/api";
import { compareDrafts, mergeDrafts } from "../backend/design/consensus";
import { DesignDraft } from "../backend/design/draft";
import { openRouterCaller, userMessage } from "../backend/design/openrouter";
import { type Caller, draftDesign } from "../backend/design/panel";

const n = (value: number, assumed = true) => ({ value, assumed });
const draft = (over: Partial<DesignDraft> = {}): DesignDraft => DesignDraft.parse({
  describesProduct: true,
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
  const examples = rules.split("\n").filter((l) => l.startsWith('{"describesProduct"'));
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
  // email and SMS go through an external sender: the same cost on both sides (1000 × 30 × $0.10/1000 + 100 × 30 × $0.01195)
  expect(rw("Email and SMS").destination.low).toBeCloseTo(3 + 35.85, 2);
  expect(a("Email and SMS").cost.low).toBeCloseTo(3 + 35.85, 2);
  expect(a("User sign-in").cost.low).toBe(0); // same library on both sides
  expect(a("User sign-in").alternative).toContain("$150"); // Cognito: 20k MAU, 10k free
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

test("only numbers the design's parts use are shown", async () => {
  const { relevantNumbers } = await import("../backend/design/parts");
  const p = (type: any, on = true) => ({ type, tier: "small" as const, why: "", on });
  expect(relevantNumbers([p("web-service"), p("relational-db")])).toEqual(["requestsPerDay", "kbPerRequest", "dataGb"]);
  expect(relevantNumbers([p("web-service"), p("messaging"), p("auth"), p("object-storage", false)])).toEqual(["requestsPerDay", "kbPerRequest", "emailsPerDay", "smsPerDay", "monthlyActiveUsers"]);
});

test("CloudFront charges only above its free tier", async () => {
  const { priceAws } = await import("../backend/pricers/aws");
  const cdn = (servedGb: number, requestsPerDay: number) => priceAws({ provider: "AWS", format: "design", unparsed: [], excluded: [], components: [{ id: "01", key: "part:cdn", category: "cdn", label: "CDN", sourceService: "", detail: "", size: { vcpu: 0, memoryGb: 0, storageGb: 0, objectStorageGb: 0, egressGb: 0 }, usageBased: false, currentMonthlyCost: 0, rowCount: 1, warnings: [], drivers: { servedGb, requestsPerDay } }] }).lines[0]!.cost.low;
  expect(cdn(500, 100_000)).toBe(0);
  expect(cdn(2024, 1_000_000)).toBeCloseTo(1000 * 0.085 + 2000 * 0.01, 6); // 1,000 GB and 20M requests over
});

test("a messaging answer sets the total and keeps the split", async () => {
  const { splitMessages } = await import("../backend/design/parts");
  expect(splitMessages(50, { emailsPerDay: 50, smsPerDay: 2000 })).toEqual({ emailsPerDay: 1, smsPerDay: 49 });
  expect(splitMessages(50, { emailsPerDay: 0, smsPerDay: 2000 })).toEqual({ emailsPerDay: 0, smsPerDay: 50 });
  expect(splitMessages(500, { emailsPerDay: 0, smsPerDay: 0 })).toEqual({ emailsPerDay: 500, smsPerDay: 0 });
});

test("a CDN halves Railway's billed egress and leaves AWS's served traffic alone", async () => {
  const { designToWorkload, DEFAULT_ASSUMPTIONS } = await import("../backend/design/parts");
  const w = (types: ("web-service" | "cdn")[]) => designToWorkload({ idea: "", parts: types.map((type) => ({ type, tier: "small", why: "", on: true })), assumptions: { ...DEFAULT_ASSUMPTIONS, requestsPerDay: 1000, kbPerRequest: 1000 } });
  expect(w(["web-service"]).components[0]!.size.egressGb).toBe(30);
  const cdn = w(["web-service", "cdn"]);
  expect(cdn.components[0]!.size.egressGb).toBe(15);
  expect(cdn.components[1]!.drivers.servedGb).toBe(30);
});

test("text that isn't a product is refused, and needs a strict majority to be", async () => {
  expect(mergeDrafts([draft({ describesProduct: false }), draft({ describesProduct: false })]).describesProduct).toBe(false);
  expect(mergeDrafts([draft({ describesProduct: false }), draft()]).describesProduct).toBe(true);
  expect(compareDrafts(draft(), draft({ describesProduct: false })).disputes).toEqual(["whether this describes a product"]);
  const saved: unknown[] = [];
  const req = () => new Request("http://x/api/designs", { method: "POST", body: JSON.stringify({ idea: "asdf qwer zxcv uiop hjkl vbnm" }) });
  const { call } = fake({ "z-ai/glm-5.3": draft({ describesProduct: false }), "deepseek/deepseek-v4-flash": draft({ describesProduct: false }) });
  const res = await createDesign(req(), "ip", { caller: call, store: { save: async () => "", load: async () => undefined, getDraft: async () => saved[0], saveDraft: async (_, r) => void saved.push(r) } });
  expect(res.status).toBe(422);
  const again = await createDesign(req(), "ip", { caller: call, store: { save: async () => "", load: async () => undefined, getDraft: async () => saved[0] } });
  expect(again.status).toBe(422); // a cached refusal stays a refusal
});

test("the client IP ignores X-Forwarded-For, and the overall cap holds across IPs", () => {
  const req = (h: Record<string, string>) => new Request("http://x", { headers: h });
  expect(clientIp(req({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "9.9.9.9" }), "fb")).toBe("1.1.1.1");
  expect(clientIp(req({ "x-forwarded-for": "9.9.9.9" }), "fb")).toBe("fb");
  const limit = limiter(slidingWindow(2, 1000), slidingWindow(3, 1000));
  expect([limit("a"), limit("a"), limit("a")]).toEqual([true, true, false]); // per IP
  expect([limit("b"), limit("c")]).toEqual([true, false]); // overall: a's blocked try didn't count
});

test("a design survives a share link, and bad links are refused", async () => {
  const { DEFAULT_ASSUMPTIONS, STARTERS, designToWorkload } = await import("../backend/design/parts");
  const { encodeDesign, decodeDesign } = await import("../backend/design/share");
  const { compareBoth } = await import("../backend/compare");
  const design = { idea: "A café booking app — 日本語 too <script>", parts: STARTERS[2]!.parts, assumptions: { ...DEFAULT_ASSUMPTIONS, smsPerDay: 40 }, guessed: ["dataGb"], questions: [], panelNote: "dropped" };
  const link = await encodeDesign(design, [20, 45]);
  expect(link).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(link.length).toBeLessThan(2000);
  const back = (await decodeDesign(link))!;
  expect(back).toEqual({ idea: design.idea, parts: design.parts, assumptions: design.assumptions, guessed: ["dataGb"], busy: [20, 45], shared: true });
  const price = (d: typeof back) => compareBoth(designToWorkload(d), { utilization: { low: 0.2, high: 0.45 } });
  expect(price(back).railway.destinationTotal).toEqual(price(design).railway.destinationTotal);

  // largest allowed design still fits under the size cap
  const big = { ...design, idea: "x".repeat(1000), parts: Array.from({ length: 30 }, (_, i) => ({ type: "search" as const, tier: "small" as const, why: String(i).repeat(200).slice(0, 200), on: true })) };
  expect(await decodeDesign(await encodeDesign(big, [0, 100]))).not.toBeNull();

  const pack = async (o: unknown) => {
    const bytes = new Uint8Array(await new Response(new Blob([JSON.stringify(o)]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const valid = { idea: "x", parts: [], assumptions: DEFAULT_ASSUMPTIONS, guessed: [], busy: [0, 10] };
  expect(await decodeDesign(await pack(valid))).not.toBeNull();
  expect(await decodeDesign(await pack({ ...valid, parts: [{ type: "evil", tier: "small", why: "", on: true }] }))).toBeNull();
  expect(await decodeDesign(await pack({ ...valid, assumptions: { ...DEFAULT_ASSUMPTIONS, dataGb: -1 } }))).toBeNull();
  expect(await decodeDesign(await pack({ ...valid, busy: [90, 10] }))).toBeNull();
  expect(await decodeDesign(await pack({ ...valid, extra: "field" }))).toBeNull();
  expect(await decodeDesign(await pack({ ...valid, idea: "x".repeat(1001) }))).toBeNull();
  expect(await decodeDesign("not-a-link")).toBeNull();
  expect(await decodeDesign("")).toBeNull();
  expect(await decodeDesign("A".repeat(16_001))).toBeNull();
});

test("ideas over 1,000 characters are refused", async () => {
  const post = (idea: string) => createDesign(new Request("http://x", { method: "POST", body: JSON.stringify({ idea }) }), "ip", { caller: fake({}).call });
  const res = await post("x".repeat(1001));
  expect(res.status).toBe(400);
  expect((await res.json()).error).toContain("1,000");
});

test("a failed cache read and a failed model are logged, without the idea", async () => {
  const out = spyOn(console, "log").mockImplementation(() => {});
  out.mockClear();
  try {
    const idea = "A private idea about booking dentists online for clinics";
    const { call } = fake({ "z-ai/glm-5.3": draft(), "deepseek/deepseek-v4-flash": new Error("deepseek: HTTP 429"), "openai/gpt-6.1-sol": draft() });
    const store = { save: async () => "", load: async () => undefined, getDraft: async () => { throw new Error("db down"); } };
    await createDesign(new Request("http://x", { method: "POST", body: JSON.stringify({ idea }), headers: { "x-railway-request-id": "req-2" } }), "ip", { caller: call, store });
    const lines = out.mock.calls.map((c) => JSON.parse(String(c[0])));
    expect(lines[0]).toMatchObject({ level: "warn", event: "draft_cache_read_failed", error: "db down", requestId: "req-2" });
    expect(lines[1]).toMatchObject({ level: "warn", event: "design_drafted", escalated: true });
    expect(lines[1].models.find((m: { ok: boolean }) => !m.ok).error).toBe("deepseek: HTTP 429");
    expect(JSON.stringify(lines)).not.toContain("dentists");
  } finally {
    out.mockRestore();
  }
});
