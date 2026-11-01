import { z } from "zod";
import { PART_TYPES } from "./parts";

/** What a model may return. Strict JSON schema: every field required, no extras, no provider names possible. */
export const QUESTION_TOPICS = ["traffic-volume", "traffic-shape", "data-size", "background-work", "file-uploads"] as const;
export type QuestionTopic = (typeof QUESTION_TOPICS)[number];

const Num = z.strictObject({ value: z.number().min(0), assumed: z.boolean() });

export const DesignDraft = z.strictObject({
  parts: z.array(z.strictObject({ type: z.enum(PART_TYPES), tier: z.enum(["small", "medium", "large"]), why: z.string().max(200) })).min(1).max(12),
  trafficShape: z.enum(["steady", "business-hours", "spiky", "mostly-idle"]),
  assumptions: z.strictObject({ requestsPerDay: Num, kbPerRequest: Num, dataGb: Num, filesGb: Num }),
  questions: z.array(z.strictObject({ topic: z.enum(QUESTION_TOPICS), text: z.string().max(160) })).max(3),
});
export type DesignDraft = z.infer<typeof DesignDraft>;

export const draftJsonSchema = z.toJSONSchema(DesignDraft);

/** Answer options for each question topic come from code, never from a model, so every draft offers the same choices. */
export const TOPIC_OPTIONS: Record<QuestionTopic, { label: string; value: string | number }[]> = {
  "traffic-volume": [{ label: "Under 10k requests/day", value: 5_000 }, { label: "10k–100k", value: 50_000 }, { label: "100k–1M", value: 400_000 }, { label: "Over 1M", value: 2_000_000 }],
  "traffic-shape": [{ label: "Steady", value: "steady" }, { label: "Business hours", value: "business-hours" }, { label: "Spiky", value: "spiky" }, { label: "Mostly idle", value: "mostly-idle" }],
  "data-size": [{ label: "Under 1 GB", value: 0.5 }, { label: "1–10 GB", value: 5 }, { label: "10–100 GB", value: 50 }, { label: "Over 100 GB", value: 250 }],
  "background-work": [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }],
  "file-uploads": [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }],
};
