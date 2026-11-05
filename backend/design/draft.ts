import { z } from "zod";
import { PART_TYPES } from "./parts";

/** What a model may return. Strict JSON schema: every field required, no extras, no provider names possible. */
export const QUESTION_TOPICS = ["traffic-volume", "traffic-shape", "data-size", "background-work", "file-uploads", "active-users", "messaging-volume", "search-needed"] as const;
export type QuestionTopic = (typeof QUESTION_TOPICS)[number];

const Num = z.strictObject({ value: z.number().min(0), assumed: z.boolean() });

export const DesignDraft = z.strictObject({
  describesProduct: z.boolean(),
  parts: z.array(z.strictObject({ type: z.enum(PART_TYPES), tier: z.enum(["small", "medium", "large"]), why: z.string().max(200) })).min(1).max(12),
  trafficShape: z.enum(["steady", "business-hours", "spiky", "mostly-idle"]),
  assumptions: z.strictObject({ requestsPerDay: Num, kbPerRequest: Num, dataGb: Num, filesGb: Num, emailsPerDay: Num, smsPerDay: Num, concurrentConnections: Num, monthlyActiveUsers: Num }),
  // Models only pick topics; code supplies the wording and the answers, so a question always matches its options.
  questions: z.array(z.enum(QUESTION_TOPICS)).max(3),
});
export type DesignDraft = z.infer<typeof DesignDraft>;

export const draftJsonSchema = z.toJSONSchema(DesignDraft);

export const TOPIC_TEXT: Record<QuestionTopic, string> = {
  "traffic-volume": "Roughly how many requests a day (page loads and API calls)?",
  "traffic-shape": "When is traffic busiest?",
  "data-size": "How big will the database be after a year?",
  "background-work": "Is there slow work that runs in the background (imports, video, bulk email)?",
  "file-uploads": "Do users upload files or images?",
  "active-users": "How many people will sign in each month?",
  "messaging-volume": "How many emails or texts a day?",
  "search-needed": "Do users need full-text search?",
};

/** A topic the design already settles is never asked. */
export const ANSWERED_BY_PART: Partial<Record<QuestionTopic, string>> = {
  "background-work": "background-worker", "file-uploads": "object-storage", "search-needed": "search",
};

/** Answer options for each question topic come from code, never from a model, so every draft offers the same choices. */
export const TOPIC_OPTIONS: Record<QuestionTopic, { label: string; value: string | number }[]> = {
  "traffic-volume": [{ label: "Under 10k requests/day", value: 5_000 }, { label: "10k–100k", value: 50_000 }, { label: "100k–1M", value: 400_000 }, { label: "Over 1M", value: 2_000_000 }],
  "traffic-shape": [{ label: "Steady", value: "steady" }, { label: "Business hours", value: "business-hours" }, { label: "Spiky", value: "spiky" }, { label: "Mostly idle", value: "mostly-idle" }],
  "data-size": [{ label: "Under 1 GB", value: 0.5 }, { label: "1–10 GB", value: 5 }, { label: "10–100 GB", value: 50 }, { label: "Over 100 GB", value: 250 }],
  "background-work": [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }],
  "file-uploads": [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }],
  "active-users": [{ label: "Under 1k a month", value: 500 }, { label: "1k–10k", value: 5_000 }, { label: "10k–100k", value: 50_000 }, { label: "Over 100k", value: 250_000 }],
  "messaging-volume": [{ label: "Under 100 a day", value: 50 }, { label: "100–1k", value: 500 }, { label: "1k–10k", value: 5_000 }, { label: "Over 10k", value: 30_000 }],
  "search-needed": [{ label: "Yes, full-text search", value: "yes" }, { label: "No, simple filters", value: "no" }],
};
