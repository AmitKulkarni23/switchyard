import { awsPriceBook } from "../pricers/aws";
import { Workload, type Component } from "../schema";

/** The design path's only vocabulary: provider-neutral parts (see docs/system-specs/design-path.md). */
export const PART_TYPES = ["web-service", "background-worker", "scheduled-job", "relational-db", "key-value-store", "queue", "object-storage", "cache", "search", "stream", "messaging", "cdn", "realtime", "auth"] as const;
export type PartType = (typeof PART_TYPES)[number];
export type Tier = "small" | "medium" | "large";
export type TrafficShape = "steady" | "business-hours" | "spiky" | "mostly-idle";

export const PART_LABEL: Record<PartType, string> = {
  "web-service": "Web service", "background-worker": "Background worker", "scheduled-job": "Scheduled job", "relational-db": "Relational database",
  "key-value-store": "Key-value store", queue: "Queue", "object-storage": "File storage", cache: "Cache",
  search: "Search", stream: "Event stream", messaging: "Email and SMS", cdn: "CDN", realtime: "Realtime (WebSockets)", auth: "User sign-in",
};
const SIZED: PartType[] = ["web-service", "background-worker", "relational-db", "cache", "search", "stream", "realtime"];
export const isSized = (t: PartType) => SIZED.includes(t);
export const TIERS: Record<Tier, { vcpu: number; memoryGb: number }> = { small: { vcpu: 1, memoryGb: 1 }, medium: { vcpu: 2, memoryGb: 4 }, large: { vcpu: 4, memoryGb: 16 } };

export type Part = { type: PartType; tier: Tier; why: string; agreement?: string; on: boolean };
export type Design = {
  idea: string;
  questions?: { topic: import("./draft").QuestionTopic; text: string; answer?: string | number }[];
  panelNote?: string;
  /** Number keys nobody has confirmed yet: guessed by the models or left at the default. */
  guessed?: string[];
  parts: Part[];
  assumptions: {
    requestsPerDay: number; kbPerRequest: number; dataGb: number; filesGb: number; trafficShape: TrafficShape;
    emailsPerDay: number; smsPerDay: number; concurrentConnections: number; monthlyActiveUsers: number;
  };
};
/** Extra assumptions only matter when their part is in the design. */
export const PART_ASSUMPTIONS: Partial<Record<PartType, (keyof Design["assumptions"])[]>> = {
  messaging: ["emailsPerDay", "smsPerDay"], realtime: ["concurrentConnections"], auth: ["monthlyActiveUsers"],
};

/** CPU busy range implied by traffic shape: the default for the "how busy" slider on a design. */
export const SHAPE_UTILIZATION: Record<TrafficShape, [number, number]> = {
  steady: [30, 60], "business-hours": [10, 40], spiky: [5, 50], "mostly-idle": [0, 10],
};

const part = (type: PartType, why: string, tier: Tier = "small"): Part => ({ type, tier, why, on: true });

/** Starting points when no model key is configured (and the fallback when the panel fails). */
export const STARTERS: { id: string; label: string; summary: string; parts: Part[] }[] = [
  { id: "web-pg", label: "Web app + Postgres", summary: "A site or API with a relational database.", parts: [part("web-service", "serves pages and the API"), part("relational-db", "stores users and records")] },
  { id: "api-worker", label: "API + background jobs", summary: "Requests hand slow work to a worker through a queue.", parts: [part("web-service", "accepts requests"), part("background-worker", "runs slow work off the request path"), part("queue", "hands jobs to the worker"), part("relational-db", "stores state")] },
  { id: "saas-files", label: "SaaS with uploads and reminders", summary: "Users upload files; a daily job sends emails or texts.", parts: [part("web-service", "app and dashboard"), part("relational-db", "accounts and records"), part("object-storage", "user uploads"), part("scheduled-job", "daily reminders")] },
  { id: "read-heavy", label: "Read-heavy app with a cache", summary: "Lots of reads of the same data.", parts: [part("web-service", "serves reads"), part("relational-db", "source of truth"), part("cache", "keeps hot reads fast")] },
  { id: "kv-api", label: "API on a key-value store", summary: "Simple lookups by key, no joins.", parts: [part("web-service", "the API"), part("key-value-store", "items looked up by key")] },
];

export const DEFAULT_ASSUMPTIONS: Design["assumptions"] = {
  requestsPerDay: 50_000, kbPerRequest: 50, dataGb: 5, filesGb: 20, trafficShape: "business-hours",
  emailsPerDay: 1_000, smsPerDay: 0, concurrentConnections: 500, monthlyActiveUsers: 5_000,
};

/** Email and SMS go through an external sender on either cloud (SES/SNS on AWS, the same or Resend/Twilio from Railway): same cost both sides. */
export const messagingCost = (emailsPerDay: number, smsPerDay: number, r = awsPriceBook.rates) => (emailsPerDay * 30 * r.ses_email_thousand) / 1000 + smsPerDay * 30 * r.sms_us_message;

/** Design → the same Workload format bills produce. Pure; runs in the browser. */
export function designToWorkload(d: Design): Workload {
  const a = d.assumptions;
  const egressGb = (a.requestsPerDay * 30 * a.kbPerRequest) / 1_000_000;
  const STREAM_GB = { small: 10, medium: 50, large: 200 } as const; // retained events on the broker's volume
  const hasCdn = d.parts.some((p) => p.on && p.type === "cdn");
  const components: Component[] = d.parts.filter((p) => p.on).map((p, i) => {
    const t = TIERS[p.tier];
    const size = { vcpu: 0, memoryGb: 0, storageGb: 0, objectStorageGb: 0, egressGb: 0 };
    const drivers: Component["drivers"] = { tier: p.tier, trafficShape: a.trafficShape };
    if (p.type === "web-service") Object.assign(size, t, { egressGb }), Object.assign(drivers, { requestsPerDay: a.requestsPerDay, kbPerRequest: a.kbPerRequest, behindCdn: hasCdn ? 1 : 0 });
    if (p.type === "background-worker" || p.type === "cache") Object.assign(size, t);
    if (p.type === "relational-db") Object.assign(size, t, { storageGb: Math.max(1, a.dataGb) }), (drivers.dataGb = a.dataGb);
    if (p.type === "scheduled-job") Object.assign(size, { vcpu: 1 * (5 / 1440), memoryGb: 1 * (5 / 1440) }), Object.assign(drivers, { runsPerDay: 1, minutesPerRun: 5 });
    if (p.type === "key-value-store") Object.assign(size, { vcpu: 0.25, memoryGb: 0.5, storageGb: Math.max(1, a.dataGb) }), Object.assign(drivers, { readsPerDay: a.requestsPerDay * 2, writesPerDay: a.requestsPerDay * 0.2, dataGb: a.dataGb });
    if (p.type === "queue") Object.assign(size, { vcpu: 0.25, memoryGb: 0.25 }), (drivers.messagesPerDay = a.requestsPerDay * 0.1);
    if (p.type === "object-storage") Object.assign(size, { objectStorageGb: a.filesGb }), (drivers.filesGb = a.filesGb);
    if (p.type === "search") Object.assign(size, t, { storageGb: Math.max(1, a.dataGb) }), (drivers.dataGb = a.dataGb);
    if (p.type === "stream") Object.assign(size, t, { storageGb: STREAM_GB[p.tier] }), (drivers.eventsPerDay = a.requestsPerDay);
    if (p.type === "realtime") Object.assign(size, t), Object.assign(drivers, { concurrentConnections: a.concurrentConnections, messagesPerDay: a.requestsPerDay });
    if (p.type === "cdn") drivers.servedGb = egressGb, (drivers.requestsPerDay = a.requestsPerDay);
    if (p.type === "auth") drivers.monthlyActiveUsers = a.monthlyActiveUsers;
    if (p.type === "messaging") Object.assign(drivers, { emailsPerDay: a.emailsPerDay, smsPerDay: a.smsPerDay });
    const external = p.type === "messaging" ? messagingCost(a.emailsPerDay, a.smsPerDay) : 0; // same on both sides
    return { id: String(i + 1).padStart(2, "0"), key: `part:${p.type}`, category: p.type, label: PART_LABEL[p.type], sourceService: "Your design", detail: isSized(p.type) ? p.tier : "", size, usageBased: false, currentMonthlyCost: external, rowCount: 1, warnings: [], drivers };
  });
  return Workload.parse({ provider: "design", format: "design", components, unparsed: [], excluded: [] });
}

export type NumberKey = "requestsPerDay" | "kbPerRequest" | "dataGb" | "filesGb" | "emailsPerDay" | "smsPerDay" | "concurrentConnections" | "monthlyActiveUsers";
/** Which numbers matter for a design: only those its parts use. */
export function relevantNumbers(parts: Part[]): NumberKey[] {
  const on = new Set(parts.filter((p) => p.on).map((p) => p.type));
  const keys: NumberKey[] = [];
  if (on.has("web-service") || on.has("realtime") || on.has("cdn")) keys.push("requestsPerDay", "kbPerRequest");
  if (on.has("relational-db") || on.has("search") || on.has("key-value-store")) keys.push("dataGb");
  if (on.has("object-storage")) keys.push("filesGb");
  for (const t of on) for (const k of PART_ASSUMPTIONS[t] ?? []) if (!keys.includes(k as NumberKey)) keys.push(k as NumberKey);
  return keys;
}
