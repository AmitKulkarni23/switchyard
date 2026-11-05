import { z } from "zod";
import { type Design, IDEA_MAX, PART_TYPES } from "./parts";

/**
 * Stateless share links: the design travels in the URL fragment (`/#d=...`), which browsers never send to a server.
 * Nothing is stored. A link is untrusted input, so it's size-capped and validated; prices are always recomputed here.
 */
const MAX_ENCODED = 16_000; // also caps decompression: deflate can't expand this past a few MB

const Num = z.number().min(0).max(1e15);
const Shared = z.strictObject({
  idea: z.string().max(IDEA_MAX),
  parts: z.array(z.strictObject({ type: z.enum(PART_TYPES), tier: z.enum(["small", "medium", "large"]), why: z.string().max(200), agreement: z.string().max(10).optional(), on: z.boolean() })).max(30),
  assumptions: z.strictObject({
    requestsPerDay: Num, kbPerRequest: Num, dataGb: Num, filesGb: Num, emailsPerDay: Num, smsPerDay: Num, concurrentConnections: Num, monthlyActiveUsers: Num,
    trafficShape: z.enum(["steady", "business-hours", "spiky", "mostly-idle"]),
  }),
  guessed: z.array(z.string().max(40)).max(20),
  busy: z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)]).refine(([low, high]) => low <= high),
});

const pipe = async (bytes: Uint8Array, through: CompressionStream | DecompressionStream) =>
  new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(through)).arrayBuffer());

/** Design + slider position → URL-safe text. Questions and the panel note stay out: answers are already in the numbers. */
export async function encodeDesign(design: Design, busy: number[]): Promise<string> {
  const payload = Shared.parse({ idea: design.idea.slice(0, IDEA_MAX), parts: design.parts, assumptions: design.assumptions, guessed: design.guessed ?? [], busy });
  const packed = await pipe(new TextEncoder().encode(JSON.stringify(payload)), new CompressionStream("deflate-raw"));
  return btoa(Array.from(packed, (b) => String.fromCharCode(b)).join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** URL-safe text → design, or null for anything damaged, oversized or malformed. */
export async function decodeDesign(encoded: string): Promise<Design | null> {
  if (encoded.length > MAX_ENCODED) return null;
  try {
    const packed = Uint8Array.from(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const text = new TextDecoder().decode(await pipe(packed, new DecompressionStream("deflate-raw")));
    const { success, data } = Shared.safeParse(JSON.parse(text));
    return success ? { ...data, shared: true } : null;
  } catch {
    return null;
  }
}
