import { SQL } from "bun";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import type { Store } from "../api";
import { Workload } from "../schema";
import { designDrafts, estimates } from "./schema";

/** 12 random alphanumerics (~71 bits): unguessable share links that are safe to paste anywhere. */
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => ALPHABET[b % ALPHABET.length]).join("");

/** Connects, applies migrations from ./drizzle and returns the share-link store. */
export async function pgStore(url: string): Promise<Store> {
  const db = drizzle({ client: new SQL(url) });
  await migrate(db, { migrationsFolder: `${import.meta.dir}/../../drizzle` });
  return {
    async save(workload) {
      const id = newId();
      await db.insert(estimates).values({ id, workload });
      return id;
    },
    async getDraft(key) {
      const [row] = await db.select().from(designDrafts).where(eq(designDrafts.cacheKey, key)).limit(1);
      return row?.result;
    },
    async saveDraft(key, result, escalated) {
      await db.insert(designDrafts).values({ cacheKey: key, result, escalated }).onConflictDoNothing();
    },
    async load(id) {
      const [row] = await db.select().from(estimates).where(eq(estimates.id, id)).limit(1);
      return row ? Workload.parse(row.workload) : undefined;
    },
  };
}
